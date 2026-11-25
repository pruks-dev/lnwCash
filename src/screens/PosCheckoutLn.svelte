<script lang="ts">
	/**
	 * PosCheckoutLn — TASK-5403 (INTENT-054, CHECKOUT-LN): Lightning checkout
	 * for a frozen PoS bill.
	 *
	 * REUSE (read-only — Receive.svelte is never modified, 0 diff):
	 *   - Mint quote thin wrappers: same NUT-04 POST /v1/mint/quote/bolt11
	 *     {amount, unit:'sat'} (Receive.svelte:404 requestMintQuoteWithUnit)
	 *     + same GET /v1/mint/quote/bolt11/{id} state probe
	 *     (Receive.svelte:429 getMintQuoteState, incl. 429 → RateLimitedError
	 *     via parseRetryAfterMs from $lib/cashu/client).
	 *   - Adaptive pacing: resetPollDelay()/nextRateLimitDelay() imported
	 *     from the Receive.svelte module script (TASK-4401 pacing helpers).
	 *   - QRDisplay data={'lightning:'+request} size 300
	 *     (Receive.svelte:1011).
	 *   - Poll lifecycle: clearPollTimer + receiveInvoiceOpen.set(false) on
	 *     EVERY exit (Receive.svelte:255 clearPollTimer, :562 flag up,
	 *     :604/:627 exit paths flag down).
	 *   - Paid path: getPrivateKey (lock throws first) → CAS claim via
	 *     compareAndSetTransactionStatus → fetchAndCacheKeysets →
	 *     withTransactionGuard(completeMint(mint, quote, amount, keysetId, true))
	 *     (Receive.svelte:656 completeMintAfterPayment).
	 *
	 * Expiry: the NUT-04 quote carries `expiry` (unix seconds — cf.
	 * MintRequestResult.expiry in mint.ts:45). A 1s ticker renders mm:ss on
	 * screen; local-expiry OR server EXPIRED OR 60-poll timeout all stop
	 * polling and show re-issue. The frozen bill is a prop and is never
	 * mutated — re-issue keeps bill/cart intact.
	 *
	 * Paid-first write (hard, 5405 contract): recordSale() runs ONLY after
	 * paid+minted; the success screen renders PosSuccess from r.value only.
	 * Never write before paid — no double-write (this file contains no
	 * setPosSales call outside the paid path).
	 *
	 * Settlement: same wallet (completeMint proofs land in-wallet) —
	 * no separate shop till. method='lightning', refId=quote id (link-by-id).
	 * Theme tokens only (L-P012) — no hardcoded colors. EN-only new keys
	 * (L-T015 — TH carries EN verbatim pending translator).
	 */
	import { _ } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	// TASK-5403 reuse: adaptive pacing helpers owned by Receive.svelte
	// (TASK-4401). Read-only import — Receive.svelte itself is untouched.
	import { resetPollDelay, nextRateLimitDelay } from './Receive.svelte';
	import { receiveInvoiceOpen } from '$lib/stores/receive-invoice';
	import { notifyMintConfirmed } from '$lib/stores/mint-events';
	import { completeMint } from '$lib/wallet/mint';
	import { getPrivateKey } from '$lib/wallet/state';
	import { withTransactionGuard } from '$lib/wallet/autolock';
	import { WalletLockedError } from '$lib/wallet/errors';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
	import { CashuError, RateLimitedError, parseRetryAfterMs } from '$lib/cashu/client';
	import {
		addTransaction,
		getTransactionById,
		updateTransaction,
		compareAndSetTransactionStatus,
		type MintClaimState
	} from '$lib/storage/db';
	import { getPosSales, setPosSales } from '$lib/storage/local';
	import { activeMintStore } from '$lib/wallet/store';
	import { recordSale } from '$lib/pos/record-sale';
	import type { Bill } from '$lib/pos/cart';
	import type { SaleRecord } from '$lib/pos/sales-log';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import QRDisplay from '$lib/components/QRDisplay.svelte';
	import PosSuccess from '../components/PosSuccess.svelte';

	interface Props {
		/** Frozen bill from Pos.svelte confirmBill — never mutated here. */
		bill: Bill;
		/** Back to the bill (cart intact — Pos.svelte owns cart state). */
		onBack?: () => void;
	}

	let { bill, onBack }: Props = $props();

	type Phase = 'creating' | 'awaiting' | 'minting' | 'expired' | 'success' | 'error';
	let phase: Phase = $state('creating');

	let mintUrl: string = $state('');
	let quoteId: string = $state('');
	let invoice: string = $state('');
	let qrData: string = $state('');
	let expiryMs: number = $state(0);
	let nowMs: number = $state(0);
	let errorMsg: string = $state('');
	/** True when the invoice was PAID but mint/record failed — retry re-attempts mint, never re-issues. */
	let paidAttempted: boolean = $state(false);
	let sale: SaleRecord | null = $state(null);

	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let expiryTimer: ReturnType<typeof setInterval> | null = null;
	let pollBackoffMs: number = $state(0);
	let pollCount: number = $state(0);
	let mintCompleting: boolean = $state(false);
	let stopped: boolean = $state(false);
	let pendingTxId: string | null = $state(null);

	const CLAIM_STATUS: MintClaimState = 'checking';
	const MAX_POLLS = 60;

	let remainingMs: number = $derived(expiryMs > 0 ? Math.max(0, expiryMs - nowMs) : 0);
	let countdownText: string = $derived.by(() => {
		if (expiryMs <= 0) return '–';
		const totalSec = Math.ceil(remainingMs / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return `${m}:${s < 10 ? '0' : ''}${s}`;
	});

	// ─── Thin wrappers — same NUT-04 paths as Receive.svelte:404/:429 ───

	async function requestMintQuoteWithUnit(
		mint: string,
		amount: number
	): Promise<{ quote: string; request: string; state: string; expiry: number }> {
		const url = `${mint.replace(/\/+$/, '')}/v1/mint/quote/bolt11`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ amount, unit: 'sat' }),
				signal: controller.signal
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new CashuError(
					`HTTP ${res.status}: ${(errData as Record<string, unknown>).detail || res.statusText}`,
					res.status
				);
			}
			const data = (await res.json()) as Record<string, unknown>;
			return {
				quote: data['quote'] as string,
				request: data['request'] as string,
				state: (data['state'] as string) ?? 'UNPAID',
				expiry: Number(data['expiry'] ?? 0)
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	async function getMintQuoteState(mint: string, id: string): Promise<string> {
		const url = `${mint.replace(/\/+$/, '')}/v1/mint/quote/bolt11/${encodeURIComponent(id)}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		try {
			const res = await fetch(url, { signal: controller.signal });
			if (res.status === 429) {
				const retryAfterMs = parseRetryAfterMs(res.headers?.get?.('Retry-After') ?? null);
				throw new RateLimitedError('Rate limited — backing off', retryAfterMs);
			}
			if (!res.ok) throw new CashuError(`HTTP ${res.status}`, res.status);
			const data = (await res.json()) as Record<string, unknown>;
			return (data['state'] as string) ?? 'UNKNOWN';
		} finally {
			clearTimeout(timeout);
		}
	}

	// ─── Lifecycle: stop EVERYTHING + flag down (Receive.svelte:255/:604) ───

	function clearPollTimer(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	function clearExpiryTimer(): void {
		if (expiryTimer) {
			clearInterval(expiryTimer);
			expiryTimer = null;
		}
	}

	function stopAll(): void {
		stopped = true;
		clearPollTimer();
		clearExpiryTimer();
		receiveInvoiceOpen.set(false);
	}

	function handleVisibilityChange(): void {
		if (document.hidden) {
			clearPollTimer();
		} else if (phase === 'awaiting' && !pollTimer && !mintCompleting && !stopped) {
			startQuotePolling();
		}
	}

	onDestroy(() => {
		stopAll();
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	// ─── Invoice creation (bill untouched — read-only) ───

	async function createInvoice(): Promise<void> {
		stopped = false;
		paidAttempted = false;
		mintCompleting = false;
		pollCount = 0;
		errorMsg = '';
		quoteId = '';
		invoice = '';
		qrData = '';
		pendingTxId = null;
		phase = 'creating';

		const mint = (get(activeMintStore) ?? '').trim();
		mintUrl = mint;
		if (!mint) {
			errorMsg = $_('common.error_mint_url_required');
			phase = 'error';
			receiveInvoiceOpen.set(false);
			return;
		}
		const amount = bill.totalSat;
		if (!Number.isInteger(amount) || amount <= 0) {
			errorMsg = $_('pos.manage.error_price');
			phase = 'error';
			receiveInvoiceOpen.set(false);
			return;
		}

		try {
			const quote = await requestMintQuoteWithUnit(mint, amount);
			if (stopped) return;
			quoteId = quote.quote;
			invoice = quote.request;
			qrData = `lightning:${quote.request}`;
			expiryMs = quote.expiry > 0 ? quote.expiry * 1000 : 0;
			nowMs = Date.now();

			pendingTxId = `mint-${quote.quote}`;
			try {
				await addTransaction({
					id: pendingTxId,
					type: 'mint',
					protocol: 'lightning',
					amount,
					mint_url: mint,
					timestamp: Date.now(),
					token_hash: null,
					invoice: quote.request,
					status: 'pending',
					fee: 0
				});
			} catch {
				/* best-effort */
			}

			phase = 'awaiting';
			pollBackoffMs = resetPollDelay();
			receiveInvoiceOpen.set(true);
			startExpiryTicker();
			startQuotePolling();
		} catch (e) {
			if (stopped) return;
			errorMsg = mapMintError(e);
			phase = 'error';
			receiveInvoiceOpen.set(false);
		}
	}

	function startExpiryTicker(): void {
		clearExpiryTimer();
		if (expiryMs <= 0) return;
		expiryTimer = setInterval(() => {
			nowMs = Date.now();
			if (nowMs >= expiryMs) expireInvoice();
		}, 1000);
	}

	function expireInvoice(): void {
		if (phase !== 'awaiting') return;
		stopAll();
		errorMsg = $_('screen.receive.error_quote_expired');
		phase = 'expired';
	}

	function startQuotePolling(): void {
		if (pollTimer) clearInterval(pollTimer);
		if (pollCount === 0) pollBackoffMs = resetPollDelay();

		const scheduleNext = (): void => {
			if (stopped || mintCompleting) return;
			pollTimer = setTimeout(tick, pollBackoffMs);
		};

		const tick = async (): Promise<void> => {
			if (stopped || mintCompleting) return;
			pollCount++;
			if (pollCount >= MAX_POLLS) {
				if (pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
				stopAll();
				paidAttempted = false;
				errorMsg = $_('screen.receive.error_payment_timeout');
				phase = 'error';
				return;
			}
			try {
				const state = await getMintQuoteState(mintUrl.trim(), quoteId);
				if (stopped || mintCompleting) return;
				pollBackoffMs = resetPollDelay();
				if (state === 'PAID' || state === 'ISSUED') {
					// ISSUED (minted elsewhere already) still means funds arrived —
					// attempt the same paid path; completeMint is idempotent-safe.
					mintCompleting = true;
					if (pollTimer) {
						clearInterval(pollTimer);
						pollTimer = null;
					}
					clearExpiryTimer();
					await completeMintAfterPayment();
				} else if (state === 'EXPIRED') {
					expireInvoice();
				} else {
					scheduleNext();
				}
			} catch (e) {
				if (e instanceof RateLimitedError) {
					pollBackoffMs = nextRateLimitDelay(pollBackoffMs, e.retryAfterMs);
				}
				if (!stopped && !mintCompleting) scheduleNext();
			}
		};

		pollTimer = setTimeout(tick, pollBackoffMs);
	}

	// ─── Paid path — mirror of Receive.svelte:656 completeMintAfterPayment ───

	async function completeMintAfterPayment(): Promise<void> {
		phase = 'minting';
		paidAttempted = true;
		try {
			getPrivateKey();

			let claimed = false;
			try {
				if (!pendingTxId) {
					claimed = true;
				} else {
					const existing = await getTransactionById(pendingTxId);
					if (!existing) {
						claimed = true;
					} else if (existing.status === 'pending') {
						claimed = await compareAndSetTransactionStatus(pendingTxId, 'pending', CLAIM_STATUS);
					}
				}
			} catch {
				claimed = true;
			}
			if (!claimed) return;

			const keysets = await fetchAndCacheKeysets(mintUrl.trim());
			const activeKeysets = keysets.filter((k) => k.active);
			if (activeKeysets.length === 0) throw new Error('No active keysets found for this mint');
			const keysetId = activeKeysets[0].id;

			const result = await withTransactionGuard(() =>
				completeMint(mintUrl.trim(), quoteId, bill.totalSat, keysetId, true)
			);
			if (!result.success) {
				if (result.error && result.error.toLowerCase().includes('wallet is locked')) {
					throw new WalletLockedError();
				}
				throw new Error(result.error ?? $_('screen.receive.error_mint_fail'));
			}

			try {
				if (pendingTxId) await updateTransaction(pendingTxId, { status: 'confirmed' });
			} catch {
				/* best-effort */
			}
			try {
				notifyMintConfirmed(bill.totalSat);
			} catch {
				/* best-effort */
			}

			// Paid-first write (5405 contract): persist BEFORE showing success.
			const recorded = recordSale(
				{
					totalSat: bill.totalSat,
					fiat: {
						currency: bill.fiat.currency,
						pricePerBtc: bill.fiat.pricePerBtc,
						amount: bill.fiat.amount,
						text: bill.fiat.text
					},
					method: 'lightning',
					refId: quoteId,
					lines: bill.lines
				},
				{ existing: getPosSales(), save: setPosSales }
			);
			if (!recorded.ok) {
				throw new Error(recorded.message);
			}
			stopAll();
			mintCompleting = false;
			sale = recorded.value;
			phase = 'success';
		} catch (e) {
			mintCompleting = false;
			if (e instanceof WalletLockedError) {
				errorMsg = $_('screen.receive.error_mint_fail');
			} else {
				errorMsg = e instanceof Error ? e.message : $_('screen.receive.error_mint_fail');
			}
			try {
				if (pendingTxId) await updateTransaction(pendingTxId, { status: 'failed' });
			} catch {
				/* best-effort */
			}
			phase = 'error';
			receiveInvoiceOpen.set(false);
		}
	}

	function retryMint(): void {
		if (!paidAttempted || !quoteId) return;
		mintCompleting = false;
		stopped = false;
		errorMsg = '';
		void completeMintAfterPayment();
	}

	function reissue(): void {
		stopAll();
		void createInvoice();
	}

	function goBack(): void {
		stopAll();
		if (onBack) onBack();
	}

	function mapMintError(error: unknown): string {
		if (error instanceof CashuError) {
			if (error.status === 404) return $_('screen.receive.error_mint_404');
			if (error.status === 403) return $_('screen.receive.error_mint_forbidden');
			if (error.status && error.status >= 500) return $_('screen.receive.error_mint_server');
			return $_('screen.receive.error_mint_fail');
		}
		if (error instanceof Error) {
			const msg = error.message.toLowerCase();
			if (msg.includes('fetch') || msg.includes('network') || msg.includes('unreachable'))
				return $_('screen.receive.error_mint_unreachable');
			if (msg.includes('timeout')) return $_('screen.receive.error_mint_timeout');
		}
		return $_('screen.receive.error_mint_fail');
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	async function handleCopyInvoice(): Promise<void> {
		try {
			await navigator.clipboard.writeText(invoice);
		} catch {
			/* clipboard unavailable — QR remains scannable */
		}
	}

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);
		void createInvoice();
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<div class="pos-checkout" role="main" aria-label={$_('pos.checkout.title')}>
	<!-- TASK-5440 rev36 header_std_r36: top-bar + header-spacer wallet
	     standard, title = central Heading h2 (align center + truncate). -->
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={goBack} aria-label={$_('common.back')}>
			<span aria-hidden="true">←</span>
		</button>
		<Heading level="h2" align="center" truncate>{$_('pos.checkout.title')}</Heading>
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
		</div>
	</Card>

	{#if phase === 'creating' || phase === 'minting'}
		<div class="loading-section">
			<div class="spinner-lg"></div>
			<Body size="md" color="secondary">
				{phase === 'creating' ? $_('screen.receive.creating_invoice') : $_('screen.receive.waiting_payment')}
			</Body>
		</div>
	{/if}

	{#if phase === 'awaiting'}
		<Card variant="basic" padding="lg">
			<div class="invoice-section">
				<QRDisplay data={qrData} size={300} />
				<div class="invoice-text">
					<Body size="sm" color="secondary">{invoice.substring(0, 40)}...</Body>
				</div>
				<div class="invoice-actions">
					<Button variant="secondary" size="sm" onclick={handleCopyInvoice}>
						{#snippet children()}{$_('common.copy')}{/snippet}
					</Button>
					<!-- TASK-5411 (MOCKUP CONFORMANCE R5): explicit Cancel —
					     R5 composite S3 (Charge) ships Copy + Cancel side by
					     side (invoice-actions pair). goBack stops polling
					     (stopAll) and returns to the intact bill, so Cancel
					     is the header-back contract made visible. Wiring
					     untouched (5403). -->
					<Button variant="ghost" size="sm" onclick={goBack} ariaLabel={$_('common.cancel')}>
						{#snippet children()}{$_('common.cancel')}{/snippet}
					</Button>
				</div>
			</div>
		</Card>
		<div class="polling-section">
			<div class="polling-indicator">
				<span class="pulse-dot" aria-hidden="true"></span>
				<Body size="sm" color="secondary">{$_('pos.checkout.waiting')}</Body>
			</div>
			<div class="countdown" role="timer" aria-live="polite">
				<Body size="sm" color="secondary">{$_('pos.checkout.expires_in')}: {countdownText}</Body>
			</div>
		</div>
	{/if}

	{#if phase === 'expired'}
		<Card variant="basic" padding="md">
			<div class="expired-section" role="alert">
				<Body size="md">{$_('pos.checkout.expired')}</Body>
				<Body size="sm" color="secondary">
					{$_('pos.total')}: {formatSat(bill.totalSat)} {$_('screen.balance.sats')}
				</Body>
				<Button variant="primary" onclick={reissue} ariaLabel={$_('pos.checkout.reissue')}>
					{#snippet children()}{$_('pos.checkout.reissue')}{/snippet}
				</Button>
			</div>
		</Card>
	{/if}

	{#if phase === 'error'}
		<div class="error-banner" role="alert">
			<Body size="sm">{errorMsg}</Body>
		</div>
		<div class="error-actions">
			{#if paidAttempted && quoteId}
				<Button variant="primary" onclick={retryMint} ariaLabel={$_('pos.checkout.retry')}>
					{#snippet children()}{$_('pos.checkout.retry')}{/snippet}
				</Button>
			{:else}
				<Button variant="primary" onclick={reissue} ariaLabel={$_('pos.checkout.reissue')}>
					{#snippet children()}{$_('pos.checkout.reissue')}{/snippet}
				</Button>
			{/if}
			<Button variant="secondary" onclick={goBack} ariaLabel={$_('common.back')}>
				{#snippet children()}{$_('common.back')}{/snippet}
			</Button>
		</div>
	{/if}

	{#if phase === 'success' && sale}
		<PosSuccess {sale} onBack={goBack} />
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

	.invoice-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	.invoice-text {
		word-break: break-all;
		text-align: center;
		padding: var(--space-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.invoice-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.polling-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md);
	}

	.polling-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.pulse-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-primary);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.5);
			opacity: 0.5;
		}
	}

	.countdown {
		display: flex;
		align-items: center;
	}

	.expired-section {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-sm);
		text-align: center;
	}

	.error-actions {
		display: flex;
		gap: var(--space-sm);
	}
</style>
