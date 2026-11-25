<script module lang="ts">
	/**
	 * TASK-5404 (INTENT-054, CHECKOUT-CASHU) — pure cashu-payment helpers.
	 *
	 * compareCashuPayment: 3-way bill reconciliation (exact / short / over).
	 * cashuTokenRefId: short deterministic link-by-id for a received token
	 * (SaleRecord.refId carries a reference only — the wallet store owns the
	 * full token_hash on its cashu_receive tx; never store the raw token here).
	 */
	export type CashuPayOutcome = 'exact' | 'short' | 'over';

	export interface CashuCompare {
		outcome: CashuPayOutcome;
		/** Bill remainder still unpaid (> 0 only when short). */
		remainingSat: number;
		/** Excess received above the bill (> 0 only when over). */
		overSat: number;
	}

	export function compareCashuPayment(billTotalSat: number, receivedSat: number): CashuCompare {
		if (!Number.isInteger(billTotalSat) || billTotalSat <= 0) {
			throw new Error('billTotalSat must be a positive integer');
		}
		if (!Number.isInteger(receivedSat) || receivedSat < 0) {
			throw new Error('receivedSat must be a non-negative integer');
		}
		if (receivedSat === billTotalSat) return { outcome: 'exact', remainingSat: 0, overSat: 0 };
		if (receivedSat < billTotalSat)
			return { outcome: 'short', remainingSat: billTotalSat - receivedSat, overSat: 0 };
		return { outcome: 'over', remainingSat: 0, overSat: receivedSat - billTotalSat };
	}

	/**
	 * Short stable ref for a received token: `cashu-<amount>s-<hash8>`.
	 * djb2 over the raw token string — deterministic, no wallet/crypto deps
	 * (pure domain, unit-testable). Uniqueness is best-effort; the wallet's
	 * own cashu_receive tx keeps the full token_hash as the source of truth.
	 */
	export function cashuTokenRefId(token: string, amount: number): string {
		let h = 5381;
		for (let i = 0; i < token.length; i++) {
			h = ((h << 5) + h + token.charCodeAt(i)) >>> 0;
		}
		return `cashu-${amount}s-${h.toString(16).padStart(8, '0')}`;
	}
</script>

<script lang="ts">
	/**
	 * PosCheckoutCashu — TASK-5404 (INTENT-054, CHECKOUT-CASHU): Cashu checkout
	 * for a frozen PoS bill.
	 *
	 * REUSE (read-only — none of these files are modified, 0 diff):
	 *   - QRScanner onDecode/onClose (src/lib/components/QRScanner.svelte):
	 *     static tokens arrive via onDecode directly; animated NUT-16 UR
	 *     fragments are reassembled inside QRScanner by the ur-decoder
	 *     wrapper (createURDecoder) and the finished cashu string is emitted
	 *     via the same onDecode. X button → onClose → scanner hides, paste
	 *     fallback stays (L-P007 — never force a scan).
	 *   - receiveTokens (src/lib/wallet/tokenStore.ts): token lands in the
	 *     SAME wallet (swap-or-passthrough inside tokenStore, untouched).
	 *   - recordSale (src/lib/pos/record-sale.ts, 5405 contract): paid-first
	 *     write — runs ONLY after receiveTokens resolves; PosSuccess renders
	 *     from r.value only. Never write before receive — no double-write
	 *     (no setPosSales call outside the received path).
	 *   - PosSuccess display pattern (src/components/PosSuccess.svelte),
	 *     same as 5403.
	 *
	 * 3-way reconciliation (compareCashuPayment, module scope above):
	 *   - exact  → one sale for the bill, success.
	 *   - short  → one PARTIAL sale for what actually entered (received only),
	 *              bill keeps the remainder; "Receive remaining" re-opens scan
	 *              and each further receipt writes its own partial sale.
	 *   - over   → one sale for what actually entered (full received amount,
	 *              excess kept in the same wallet — NO auto-change in v1).
	 * Fiat snapshot: copied from the bill ONLY when sale.totalSat equals the
	 * bill (exact). Partial/over sales carry currency + pricePerBtc with an
	 * empty text — the snapshot belongs to the full bill, never invent fiat.
	 * Theme tokens only (L-P012) — no hardcoded colors. EN-only new keys
	 * (L-T015 — TH carries EN verbatim pending translator).
	 */
	import { _ } from 'svelte-i18n';
	import QRScanner from '$lib/components/QRScanner.svelte';
	import { receiveTokens } from '$lib/wallet/tokenStore';
	import { isCashuToken, decodeToken, getTokenAmount } from '$lib/cashu/token';
	import { recordSale } from '$lib/pos/record-sale';
	import { getPosSales, setPosSales } from '$lib/storage/local';
	import type { Bill } from '$lib/pos/cart';
	import type { SaleRecord } from '$lib/pos/sales-log';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PosSuccess from '../components/PosSuccess.svelte';

	interface Props {
		/** Frozen bill from Pos.svelte confirmBill — never mutated here. */
		bill: Bill;
		/** Back to the bill (cart intact — Pos.svelte owns cart state). */
		onBack?: () => void;
	}

	let { bill, onBack }: Props = $props();

	type Phase = 'scan' | 'preview' | 'receiving' | 'done' | 'error';
	let phase: Phase = $state('scan');

	/** Camera scanner visible — X (onClose) hides it, paste always stays. */
	let showScanner: boolean = $state(true);
	let pastedToken: string = $state('');
	let preview: { raw: string; amount: number; mint: string; proofCount: number } | null =
		$state(null);
	let errorMsg: string = $state('');

	/** Session accumulation across top-up scans (short case). */
	let cumulativeSat: number = $state(0);
	let sales: SaleRecord[] = $state([]);
	let lastSale: SaleRecord | null = $state(null);
	let outcome: CashuPayOutcome | null = $state(null);
	let remainingSat: number = $state(0);
	let overSat: number = $state(0);

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	/** Shared decode gate for scanner frames AND manual paste (L-P007). */
	function handleDecode(raw: string): void {
		const token = raw.trim();
		errorMsg = '';
		preview = null;
		if (token.length === 0) {
			errorMsg = $_('pos.cashu.error_invalid');
			phase = 'error';
			return;
		}
		try {
			if (!isCashuToken(token)) throw new Error('not a cashu token');
			const decoded = decodeToken(token);
			const amount = getTokenAmount(decoded);
			if (!Number.isInteger(amount) || amount <= 0) throw new Error('empty token');
			preview = { raw: token, amount, mint: decoded.mint, proofCount: decoded.proofs.length };
			phase = 'preview';
		} catch {
			errorMsg = $_('pos.cashu.error_invalid');
			phase = 'error';
		}
	}

	function cancelPreview(): void {
		preview = null;
		errorMsg = '';
		phase = 'scan';
	}

	function backToScan(): void {
		preview = null;
		errorMsg = '';
		pastedToken = '';
		phase = 'scan';
	}

	async function handlePasteClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				pastedToken = text;
				handleDecode(text);
			}
		} catch {
			/* clipboard unavailable — manual typing still works */
		}
	}

	async function confirmReceive(): Promise<void> {
		// TASK-5414 (MONEY PROOF): double-submit guard — second tap while the
		// first receive is in flight returns early, so one token = one
		// receiveTokens + one recordSale (no double-write). Phase is set to
		// 'receiving' synchronously below, so a same-tick double click sees
		// the guard before the await yields.
		if (phase === 'receiving') return;
		if (!preview) return;
		const raw = preview.raw;
		phase = 'receiving';
		errorMsg = '';
		try {
			// Same-wallet receive (swap-or-passthrough lives in tokenStore).
			const result = await receiveTokens(raw);

			// Paid-first write (5405 contract): persist BEFORE showing success.
			const saleTotal = result.amount;
			const exactBill = saleTotal === bill.totalSat;
			const recorded = recordSale(
				{
					totalSat: saleTotal,
					fiat: exactBill
						? {
								currency: bill.fiat.currency,
								pricePerBtc: bill.fiat.pricePerBtc,
								amount: bill.fiat.amount,
								text: bill.fiat.text
							}
						: {
								currency: bill.fiat.currency,
								pricePerBtc: bill.fiat.pricePerBtc,
								amount: null,
								text: ''
							},
					method: 'cashu',
					refId: cashuTokenRefId(raw, saleTotal),
					lines: bill.lines
				},
				{ existing: getPosSales(), save: setPosSales }
			);
			if (!recorded.ok) {
				throw new Error(recorded.message);
			}
			cumulativeSat += saleTotal;
			sales = [...sales, recorded.value];
			lastSale = recorded.value;
			const cmp = compareCashuPayment(bill.totalSat, cumulativeSat);
			outcome = cmp.outcome;
			remainingSat = cmp.remainingSat;
			overSat = cmp.overSat;
			preview = null;
			pastedToken = '';
			phase = 'done';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : $_('pos.cashu.error_invalid');
			phase = 'error';
		}
	}

	function receiveMore(): void {
		preview = null;
		errorMsg = '';
		pastedToken = '';
		showScanner = true;
		phase = 'scan';
	}

	function goBack(): void {
		if (onBack) onBack();
	}
</script>

<div class="pos-checkout" role="main" aria-label={$_('pos.cashu.title')}>
	<!-- TASK-5440 rev36 header_std_r36: top-bar + header-spacer wallet
	     standard, title = central Heading h2 (align center + truncate). -->
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={goBack} aria-label={$_('common.back')}>
			<span aria-hidden="true">←</span>
		</button>
		<Heading level="h2" align="center" truncate>{$_('pos.cashu.title')}</Heading>
		<div class="header-spacer"></div>
	</div>

	<Card variant="basic" padding="md">
		<div class="amount-block" role="status">
			<Body size="sm" color="secondary">{$_('pos.total')}</Body>
			<div class="amount-line">
				<span class="amount-value">{formatSat(bill.totalSat)}</span>
				<span class="amount-unit">{$_('screen.balance.sats')}</span>
			</div>
			<Body size="sm" color="secondary">{bill.fiat.text}</Body>
			{#if cumulativeSat > 0 && phase === 'done'}
				<Body size="sm" color="secondary">
					{$_('pos.cashu.received_label')}: {formatSat(cumulativeSat)}
					{$_('screen.balance.sats')}
				</Body>
			{/if}
		</div>
	</Card>

	{#if phase === 'scan'}
		<Card variant="basic" padding="md">
			<div class="scan-section">
				<Body size="sm" color="secondary">{$_('pos.cashu.scan_hint')}</Body>
				{#if showScanner}
					<!-- TASK-5440 rev36 hide_x_pos_r36: PoS Cashu hides the
					     QRScanner X (hideClose) — exit owns to the header
					     back button above; paste fallback stays (L-P007). -->
					<QRScanner onDecode={handleDecode} onClose={() => (showScanner = false)} hideClose />
					<button
						type="button"
						class="link-btn"
						onclick={() => (showScanner = false)}
						aria-label={$_('pos.cashu.hide_scanner')}
					>
						{$_('pos.cashu.hide_scanner')}
					</button>
				{:else}
					<button
						type="button"
						class="link-btn"
						onclick={() => (showScanner = true)}
						aria-label={$_('pos.cashu.show_scanner')}
					>
						{$_('pos.cashu.show_scanner')}
					</button>
				{/if}
				<div class="paste-block">
					<Body size="sm" weight="semibold">{$_('pos.cashu.paste_label')}</Body>
					<!-- TASK-5436 rev34: buttons-only paste — NO textarea, NO typing.
					     Paste reads the clipboard and auto-submits (decode →
					     preview); Confirm re-validates the clipboard content. -->
					<div class="paste-actions">
						<Button
							variant="secondary"
							size="sm"
							onclick={handlePasteClipboard}
							ariaLabel={$_('common.paste')}
						>
							{#snippet children()}<span data-testid="cashu-paste-btn">{$_('common.paste')}</span>{/snippet}
						</Button>
						<Button
							variant="primary"
							size="sm"
							onclick={() => handleDecode(pastedToken)}
							ariaLabel={$_('pos.cashu.confirm')}
						>
							{#snippet children()}<span data-testid="cashu-confirm-btn">{$_('pos.cashu.confirm')}</span>{/snippet}
						</Button>
					</div>
				</div>
			</div>
		</Card>
	{/if}

	{#if phase === 'preview' && preview}
		<Card variant="basic" padding="lg">
			<div class="preview-section" role="status">
				<!-- TASK-5440 rev36: section title = central Heading h3. -->
				<Heading level="h3" align="center" truncate>{$_('pos.cashu.preview_title')}</Heading>
				<div class="preview-details">
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('pos.cashu.amount_label')}</Body>
						<Body size="sm" weight="semibold">
							{formatSat(preview.amount)} {$_('screen.balance.sats')}
						</Body>
					</div>
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('pos.cashu.mint_label')}</Body>
						<Body size="sm" weight="semibold">{preview.mint}</Body>
					</div>
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('pos.cashu.proofs_label')}</Body>
						<Body size="sm" weight="semibold">{preview.proofCount}</Body>
					</div>
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('pos.total')}</Body>
						<Body size="sm" weight="semibold">
							{formatSat(bill.totalSat)} {$_('screen.balance.sats')}
						</Body>
					</div>
				</div>
				<div class="preview-actions">
					<Button variant="secondary" onclick={cancelPreview} ariaLabel={$_('common.back')}>
						{#snippet children()}{$_('common.back')}{/snippet}
					</Button>
					<Button variant="primary" onclick={confirmReceive} ariaLabel={$_('pos.cashu.receive_btn')}>
						{#snippet children()}{$_('pos.cashu.receive_btn')}{/snippet}
					</Button>
				</div>
			</div>
		</Card>
	{/if}

	{#if phase === 'receiving'}
		<div class="loading-section">
			<div class="spinner-lg"></div>
			<Body size="md" color="secondary">{$_('pos.cashu.receiving')}</Body>
		</div>
	{/if}

	{#if phase === 'error'}
		<div class="error-banner" role="alert">
			<Body size="sm">{errorMsg}</Body>
		</div>
		<div class="error-actions">
			<Button variant="primary" onclick={backToScan} ariaLabel={$_('pos.cashu.retry_scan')}>
				{#snippet children()}{$_('pos.cashu.retry_scan')}{/snippet}
			</Button>
			<Button variant="secondary" onclick={goBack} ariaLabel={$_('common.back')}>
				{#snippet children()}{$_('common.back')}{/snippet}
			</Button>
		</div>
	{/if}

	{#if phase === 'done' && lastSale}
		{#if outcome === 'short'}
			<div class="notice-banner short" role="status">
				<!-- TASK-5411 (MOCKUP CONFORMANCE R5): UNDER status pill —
				     risk-a ships UNDER / EXACT / OVER as status pills. The
				     short banner keeps its note + remaining + receive-more
				     contract (5404) and gains the pill as its status head. -->
				<span class="pill pill-warn">{$_('pos.cashu.short_pill')}</span>
				<Body size="sm">
					{$_('pos.cashu.short_note', {
						values: { received: formatSat(cumulativeSat), total: formatSat(bill.totalSat) }
					})}
				</Body>
				<Body size="sm" weight="semibold">
					{$_('pos.cashu.remaining_label')}: {formatSat(remainingSat)}
					{$_('screen.balance.sats')}
				</Body>
				<Button variant="primary" onclick={receiveMore} ariaLabel={$_('pos.cashu.receive_more')}>
					{#snippet children()}{$_('pos.cashu.receive_more')} ({formatSat(remainingSat)}){/snippet}
				</Button>
			</div>
		{:else if outcome === 'over'}
			<div class="notice-banner over" role="status">
				<!-- TASK-5411 (MOCKUP CONFORMANCE R5): OVER status pill —
				     risk-a ships UNDER / EXACT / OVER as status pills. The
				     over banner keeps its note + excess-amount contract
				     (5404, record-only no auto-change) with the pill head. -->
				<span class="pill pill-cashu">{$_('pos.cashu.over_pill')}</span>
				<Body size="sm">{$_('pos.cashu.over_note')}</Body>
				<Body size="sm" weight="semibold">
					+{formatSat(overSat)} {$_('screen.balance.sats')}
				</Body>
			</div>
		{/if}
		<PosSuccess sale={lastSale} onBack={goBack} />
	{/if}
</div>

<style>
	.pos-checkout {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		max-width: 480px;
		margin: 0 auto;
	}

	/* TASK-5440 rev36: top-bar wallet standard (was checkout-header). */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.top-bar :global(h2) {
		flex: 1;
		min-width: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		color: var(--color-text);
		font-size: var(--font-size-lg);
		cursor: pointer;
		flex-shrink: 0;
	}

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.header-spacer {
		width: 44px;
	}

	.amount-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}

	.amount-line {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.amount-value {
		font-family: var(--font-family);
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
	}

	.amount-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.scan-section {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-sm);
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		padding: var(--space-xs) var(--space-sm);
		min-height: 44px;
		align-self: center;
		-webkit-tap-highlight-color: transparent;
	}

	.link-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.paste-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-sm);
	}

	/* TASK-5436 rev34: wallet Button owns the paste actions (no textarea). */
	.paste-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.paste-actions :global(button) {
		flex: 1;
	}

	.preview-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.preview-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.detail-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.preview-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.loading-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-xl);
	}

	.spinner-lg {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-banner {
		padding: var(--space-sm);
		border-radius: var(--radius-md);
		background: var(--color-error-light);
		color: var(--color-error);
	}

	.error-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.notice-banner {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-sm);
		border-radius: var(--radius-md);
	}

	.notice-banner.short {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	.notice-banner.over {
		background: var(--color-success-light);
		color: var(--color-success);
	}

	/* TASK-5411 (MOCKUP CONFORMANCE R5): risk-a status pills — pill
	   geometry verbatim from the R5 composite fixture (radius-full).
	   pill-warn = warning tokens; pill-cashu bg is the R5-fixture
	   translucent teal (identical light + dark, theme-neutral). */
	.pill {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		padding: var(--space-xs) var(--space-sm);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		border-radius: var(--radius-full);
		border: 1.5px solid transparent;
		white-space: nowrap;
	}

	.pill-warn {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	.pill-cashu {
		/* TASK-5436 rev34 theme sweep: token-derived translucent teal
		   (was hardcoded rgba) — identical light + dark, theme-neutral. */
		background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
		color: var(--color-secondary);
	}
</style>
