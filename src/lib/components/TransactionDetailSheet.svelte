<script lang="ts">
	/**
	 * TransactionDetailSheet — TASK-150 (CV17-002)
	 * Bottom sheet displaying full transaction details when a tx card is tapped in History.
	 * 10 fields: type icon, amount, protocol+color, direction, timestamp, status,
	 *            invoice (Lightning) / token_hash (Cashu), fee, mint URL, tx ID/hash.
	 * Accessibility: role='dialog', aria-label, focus trap.
	 */
	import { _ } from 'svelte-i18n';
	import type { Transaction } from '$lib/types';
	import { checkMintQuote } from '$lib/cashu/client';
	import { updateTransaction } from '$lib/storage/db';
	import { notifyMintConfirmed } from '$lib/stores/mint-events';
	import { completeMint } from '$lib/wallet/mint';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
	import Iconly from '$lib/iconly/Iconly.svelte';
	import QRDisplay from '$lib/components/QRDisplay.svelte';

	interface Props {
		/** Transaction data to display */
		tx?: Transaction | null;
		/** Close handler — called on overlay tap, close button, or swipe */
		onclose?: () => void;
	}

	let { tx = null, onclose }: Props = $props();

	// ─── Derived state ─────────────────────────────────
	let open = $derived(tx != null);

	// Copy feedback state
	let copiedField: string | null = $state(null);

	// Check payment state
	let checking = $state(false);

	// Double-submit guard (TASK-243) — mirrors Receive.svelte `mintCompleting` (TASK-230).
	// Blocks re-entrant completeMint() while a mint completion is already in flight;
	// a re-submit of the same blinded outputs would hit mint 400 "outputs already signed".
	let mintCompleting = $state(false);

	// Swipe gesture state
	let sheetTranslateY: number = $state(0);
	let touchStartY: number = $state(0);
	let isDragging: boolean = $state(false);

	// ─── Focus trap references ─────────────────────────
	let sheetRef: HTMLDivElement | undefined = $state();
	let previousFocus: HTMLElement | undefined;

	// ─── Lifecycle: focus trap ─────────────────────────
	$effect(() => {
		if (open) {
			previousFocus = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';
			setTimeout(() => {
				const firstFocusable = sheetRef?.querySelector<HTMLElement>(
					'button, [tabindex]:not([tabindex="-1"])'
				);
				firstFocusable?.focus();
			}, 100);
		} else {
			document.body.style.overflow = '';
			previousFocus?.focus();
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	// ─── Derived helpers ──────────────────────────────
	function getTxCategory(type: string): 'Send' | 'Receive' {
		switch (type) {
			case 'mint':
			case 'cashu_receive':
				return 'Receive';
			case 'melt':
			case 'transfer':
			case 'cashu_send':
				return 'Send';
			default:
				return 'Receive';
		}
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	function formatDateTime(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function typeLabel(type: string): string {
		switch (type) {
			case 'mint': return $_('screen.history.type_receive');
			case 'melt': return $_('screen.history.type_send');
			case 'transfer': return $_('screen.history.type_transfer');
			case 'cashu_send': return $_('screen.history.type_send');
			case 'cashu_receive': return $_('screen.history.type_receive');
			default: return type;
		}
	}

	function protocolLabel(protocol?: string): string {
		switch (protocol) {
			case 'lightning': return $_('screen.history.protocol_lightning');
			case 'cashu': return $_('screen.history.protocol_cashu');
			default: return '';
		}
	}

	function directionLabel(category: 'Send' | 'Receive'): string {
		return category === 'Receive'
			? $_('detail.direction_receive')
			: $_('detail.direction_send');
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'confirmed': return $_('screen.history.status_confirmed');
			case 'pending': return $_('screen.history.status_pending');
			case 'failed': return $_('screen.history.status_failed');
			default: return status;
		}
	}

	// ─── Actions ──────────────────────────────────────
	function handleClose() {
		sheetTranslateY = 0;
		isDragging = false;
		onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	// ─── Swipe down gesture ───────────────────────────
	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		const dy = e.touches[0].clientY - touchStartY;
		if (dy > 0) {
			sheetTranslateY = dy;
		}
	}

	function handleTouchEnd() {
		isDragging = false;
		if (sheetTranslateY > 120) {
			handleClose();
		} else {
			sheetTranslateY = 0;
		}
	}

	// ─── Copy to clipboard ────────────────────────────
	async function copyToClipboard(text: string, fieldId: string) {
		// Try HTTPS-capable clipboard first
		if (navigator.clipboard && window.isSecureContext) {
			try {
				await navigator.clipboard.writeText(text);
				copiedField = fieldId;
				setTimeout(() => { copiedField = null; }, 2000);
				return;
			} catch {
				// Fall through to fallback
			}
		}
		// Fallback: use legacy execCommand
		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.position = 'fixed';
			textarea.style.opacity = '0';
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			copiedField = fieldId;
			setTimeout(() => { copiedField = null; }, 2000);
		} catch {
			console.warn('Clipboard copy failed');
		}
	}

	// ─── Mint error classification (TASK-243) ────────────────
	// Mint 400 semantics (TASK-231 repro, live mint Nutshell/0.20.1):
	//   11003 "outputs already signed" = already-minted (benign) → confirm, no retry loop
	//   20002 "quote already issued"   = double-submit  (benign) → confirm, no retry loop
	//   other (incl. "outputs mismatch") = real error            → surface, keep pending
	function mintErrorMessage(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === 'string') return error;
		return error == null ? '' : String(error);
	}

	/**
	 * True when the error is a genuine mint HTTP response ("HTTP <status> ..."),
	 * as produced by fetchFromMint(). Client-side guard errors (e.g. TASK-240's
	 * counter-reuse guard) merely *quote* "outputs already signed" / "11003" in
	 * their message without being a real mint 400 — those must NOT be classified
	 * as benign.
	 */
	function isHttpErrorMessage(error: unknown): boolean {
		return /^HTTP\s+\d{3}\b/.test(mintErrorMessage(error));
	}

	function mintErrorCode(error: unknown): number | undefined {
		// 1. Structured `code` field — set by TASK-241 (CashuError.code) on real HTTP errors.
		if (error && typeof error === 'object' && 'code' in error) {
			const code = (error as { code?: unknown }).code;
			if (typeof code === 'number') return code;
			if (typeof code === 'string') {
				const parsed = Number.parseInt(code, 10);
				if (!Number.isNaN(parsed)) return parsed;
			}
		}
		// 2. For genuine HTTP responses, parse a 5-digit code from the message
		//    ("HTTP 400 (11003): outputs already signed"). Never parse client-side
		//    error strings, which may mention a code without being a mint response.
		if (isHttpErrorMessage(error)) {
			const match = mintErrorMessage(error).match(/\b(\d{5})\b/);
			if (match) {
				const parsed = Number.parseInt(match[1], 10);
				if (!Number.isNaN(parsed)) return parsed;
			}
		}
		return undefined;
	}

	type MintErrorKind = 'already-minted' | 'double-submit' | 'real';

	function classifyMintError(error: unknown): MintErrorKind {
		const code = mintErrorCode(error);
		if (code === 11003) return 'already-minted';
		if (code === 20002) return 'double-submit';

		// Detail-string fallback — only for genuine HTTP error responses.
		if (isHttpErrorMessage(error)) {
			const msg = mintErrorMessage(error).toLowerCase();
			if (msg.includes('outputs already signed')) return 'already-minted';
			if (msg.includes('quote already issued')) return 'double-submit';
		}

		return 'real';
	}

	// ─── Check Payment (pending mint) ─────────────────
	async function checkPayment() {
		if (!tx || checking || mintCompleting) return;
		checking = true;
		try {
			const quoteId = tx.id.startsWith('mint-') ? tx.id.slice(5) : tx.id;
			const quote = await checkMintQuote(tx.mint_url, quoteId);
			const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');
			if (state === 'ISSUED') {
				// Quote already issued → tokens already minted (benign double-submit).
				// Mark confirmed without re-submitting outputs — no completeMint call.
				await updateTransaction(tx.id, { status: 'confirmed' });
				notifyMintConfirmed(tx.amount);
				tx = { ...tx, status: 'confirmed' };
			} else if (state === 'PAID') {
				// Double-submit guard (TASK-243): set before the await so any re-entrant
				// call bails immediately, then release in finally (mirrors TASK-230).
				mintCompleting = true;
				try {
					// Fetch keysets and complete the mint
					const keysets = await fetchAndCacheKeysets(tx.mint_url);
					const active = keysets.filter(k => k.active);
					if (active.length === 0) {
						console.warn('[checkPayment] no active keysets');
						return;
					}
					const result = await completeMint(tx.mint_url, quoteId, tx.amount, active[0].id, false);
					// completeMint returns (does not throw) on failure — classify it.
					if (!result.success) {
						const kind = classifyMintError(result.error);
						const benign = kind === 'already-minted' || kind === 'double-submit';
						if (!benign) {
							// Real error (e.g. outputs mismatch): keep pending, surface, no auto-retry.
							console.warn('[checkPayment] mint failed:', result.error);
							return;
						}
						// Benign 400: mint already happened (already-minted / double-submit).
						// Fall through to confirmed — do NOT retry, do NOT surface as a hard error.
					}
				} finally {
					mintCompleting = false;
				}

				await updateTransaction(tx.id, { status: 'confirmed' });
				notifyMintConfirmed(tx.amount);
				tx = { ...tx, status: 'confirmed' };
			} else if (state === 'EXPIRED') {
				await updateTransaction(tx.id, { status: 'failed' });
				tx = { ...tx, status: 'failed' };
			}
		} catch (err) {
			console.warn('[checkPayment]', err);
		} finally {
			checking = false;
		}
	}

	// ─── Focus trap: keep focus inside sheet ──────────
	function handleSheetKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			const sheet = sheetRef;
			if (!sheet) return;
			const focusable = sheet.querySelectorAll<HTMLElement>(
				'button, [tabindex]:not([tabindex="-1"]), input, textarea, select'
			);
			if (focusable.length === 0) return;

			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// ─── Computed display values ──────────────────────
	let category = $derived(tx ? getTxCategory(tx.type) : 'Receive' as const);
	let displayAmount = $derived(tx
		? `${category === 'Receive' ? '+' : '-'}${formatSat(tx.amount)} sats`
		: '');
	let isLightning = $derived(tx?.protocol === 'lightning' || tx?.type === 'melt' || tx?.type === 'mint');
	let isCashu = $derived(tx?.protocol === 'cashu' || tx?.type === 'cashu_send' || tx?.type === 'cashu_receive');
	let displayData = $derived(isLightning ? tx?.invoice : tx?.token_hash);

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if open && tx}
	{@const t = tx}
	<div
		class="sheet-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="presentation"
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={sheetRef}
			class="sheet-content"
			style:transform="translateY({sheetTranslateY}px)"
			role="dialog"
			aria-modal="true"
			aria-label={$_('detail.title')}
			tabindex={-1}
			onkeydown={handleSheetKeydown}
		>
			<!-- ─── Swipe Handle ────────────────────────── -->
			<div
				class="sheet-handle-area"
				ontouchstart={handleTouchStart}
				ontouchmove={handleTouchMove}
				ontouchend={handleTouchEnd}
				aria-hidden="true"
			>
				<div class="sheet-handle"></div>
			</div>

			<!-- ─── Header ──────────────────────────────── -->
			<div class="sheet-header">
				<h2 class="sheet-title">{$_('detail.title')}</h2>
				<button
					type="button"
					class="sheet-close"
					aria-label={$_('common.close')}
					onclick={handleClose}
				>
					<Iconly name="Close" size={20} />
				</button>
			</div>

			<!-- ─── Body: 10 fields ─────────────────────── -->
			<div class="sheet-body">

				<!-- QR Code -->
				{#if displayData}
					<div class="detail-qr">
						<QRDisplay data={displayData} size={200} />
					</div>
				{/if}

				<!-- Row 1: Type Icon + Direction -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_type')}</span>
					<div class="field-value field-value-inline">
						<span
							class="detail-icon"
							class:icon-receive={category === 'Receive'}
							class:icon-send={category === 'Send'}
						>
							<Iconly name={category} size={20} />
						</span>
						<span>{directionLabel(category)} — {typeLabel(tx.type)}</span>
					</div>
				</div>

				<!-- Row 2: Amount -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_amount')}</span>
					<span
						class="field-value detail-amount"
						class:amount-receive={category === 'Receive'}
						class:amount-send={category === 'Send'}
					>
						{displayAmount}
					</span>
				</div>

				<!-- Row 3: Protocol + Color -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_protocol')}</span>
					<div class="field-value">
						{#if tx.protocol}
							<span
								class="protocol-badge"
								class:protocol-lightning={tx.protocol === 'lightning'}
								class:protocol-cashu={tx.protocol === 'cashu'}
							>
								{protocolLabel(tx.protocol)}
							</span>
						{:else}
							<span class="field-value-na">—</span>
						{/if}
					</div>
				</div>

				<!-- Row 4: Direction -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_direction')}</span>
					<span class="field-value">{directionLabel(category)}</span>
				</div>

				<!-- Row 5: Timestamp -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_timestamp')}</span>
					<span class="field-value">{formatDateTime(tx.timestamp)}</span>
				</div>

				<!-- Row 6: Status -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_status')}</span>
					<div class="field-value">
						<span
							class="status-badge"
							class:status-confirmed={tx.status === 'confirmed'}
							class:status-pending={tx.status === 'pending'}
							class:status-failed={tx.status === 'failed'}
						>
							{statusLabel(tx.status)}
						</span>
					</div>
				</div>

				<!-- Check Payment Button (pending mint only) -->
				{#if tx.type === 'mint' && tx.status === 'pending'}
					<div class="detail-row">
						<button class="check-btn" onclick={checkPayment}>
							{checking ? 'กำลังตรวจสอบ...' : $_('detail.check_payment')}
						</button>
					</div>
				{/if}

				<!-- Row 7: Invoice (Lightning) / Token (Cashu) -->
				<div class="detail-field">
					{#if isLightning}
						<span class="field-label">{$_('detail.field_invoice')}</span>
						<div class="field-value field-value-copy">
							{#if tx.invoice}
								<code class="mono-truncate" title={tx.invoice}>{tx.invoice}</code>
								<button
									type="button"
									class="copy-btn"
									aria-label={$_('common.copy') + ' ' + $_('detail.field_invoice')}
									onclick={() => copyToClipboard(t.invoice!, 'invoice')}
								>
									<Iconly name={copiedField === 'invoice' ? 'Check' : 'Copy'} size={14} />
								</button>
							{:else}
								<span class="field-value-na">—</span>
							{/if}
						</div>
					{:else if isCashu}
						<span class="field-label">{$_('detail.field_cashu_token')}</span>
						<div class="field-value field-value-copy">
							{#if tx.token_hash}
								<code class="mono-truncate" title={tx.token_hash}>{tx.token_hash}</code>
								<button
									type="button"
									class="copy-btn"
									aria-label={$_('common.copy') + ' ' + $_('detail.field_cashu_token')}
									onclick={() => copyToClipboard(t.token_hash!, 'token_hash')}
								>
									<Iconly name={copiedField === 'token_hash' ? 'Check' : 'Copy'} size={14} />
								</button>
							{:else}
								<span class="field-value-na">—</span>
							{/if}
						</div>
					{:else}
						<span class="field-label">{$_('detail.field_invoice')}</span>
						<span class="field-value-na">—</span>
					{/if}
				</div>

				<!-- Row 7b: Preimage (Lightning melt only) -->
				{#if tx.type === 'melt' && tx.preimage}
					<div class="detail-field">
						<span class="field-label">{$_('detail.field_preimage')}</span>
						<div class="field-value field-value-copy">
							<code class="mono-truncate" title={tx.preimage}>{tx.preimage}</code>
							<button
								type="button"
								class="copy-btn"
								aria-label={$_('common.copy') + ' ' + $_('detail.field_preimage')}
								onclick={() => copyToClipboard(t.preimage!, 'preimage')}
							>
								<Iconly name={copiedField === 'preimage' ? 'Check' : 'Copy'} size={14} />
							</button>
						</div>
					</div>
				{/if}

				<!-- Row 8: Fee (only shown when > 0) -->
				<!-- TASK-314: display actual_fee (true cost after NUT-08 overpaid return) when present, fall back to fee (legacy). -->
				{#if (tx.actual_fee ?? tx.fee) != null && (tx.actual_fee ?? tx.fee) > 0}
					<div class="detail-field">
						<span class="field-label">{$_('detail.field_fee')}</span>
						<span class="field-value">
							{tx.actual_fee ?? tx.fee} sats
							{#if tx.actual_fee != null && tx.fee != null && tx.actual_fee !== tx.fee}
								<span class="field-meta">({$_('detail.field_fee_reserve')}: {tx.fee})</span>
							{/if}
						</span>
					</div>
				{/if}

				<!-- Row 9: Mint URL -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_mint_url')}</span>
					<div class="field-value field-value-copy">
						<code class="mono-truncate" title={tx.mint_url}>{tx.mint_url}</code>
						<button
							type="button"
							class="copy-btn"
							aria-label={$_('common.copy') + ' ' + $_('detail.field_mint_url')}
							onclick={() => copyToClipboard(t.mint_url, 'mint_url')}
						>
							<Iconly name={copiedField === 'mint_url' ? 'Check' : 'Copy'} size={14} />
						</button>
					</div>
				</div>

				<!-- Row 10: Tx ID / Hash -->
				<div class="detail-field">
					<span class="field-label">{$_('detail.field_tx_id')}</span>
					<div class="field-value field-value-copy">
						<code class="mono-truncate" title={tx.id}>{tx.id}</code>
						<button
							type="button"
							class="copy-btn"
							aria-label={$_('common.copy') + ' ' + $_('detail.field_tx_id')}
							onclick={() => copyToClipboard(t.id, 'tx_id')}
						>
							<Iconly name={copiedField === 'tx_id' ? 'Check' : 'Copy'} size={14} />
						</button>
					</div>
				</div>

			</div>
		</div>
	</div>
{/if}

<style>
	/* ─── Backdrop ────────────────────────────────────── */
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: backdrop-in 0.25s ease;
	}

	@keyframes backdrop-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	/* ─── Sheet Content ──────────────────────────────── */
	.sheet-content {
		background: var(--color-surface);
		color: var(--color-text);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		width: 100%;
		max-width: 480px;
		max-height: 85vh;
		overflow-y: auto;
		padding-bottom: env(safe-area-inset-bottom, var(--space-md));
		outline: none;
		animation: sheet-slide-in 0.3s ease;
		transition: transform 0.1s ease-out;
		will-change: transform;
	}

	@keyframes sheet-slide-in {
		from { transform: translateY(100%); }
		to   { transform: translateY(0); }
	}

	/* ─── Swipe Handle ────────────────────────────────── */
	.sheet-handle-area {
		display: flex;
		justify-content: center;
		padding: var(--space-sm) 0;
		touch-action: none;
		cursor: grab;
	}

	.sheet-handle-area:active {
		cursor: grabbing;
	}

	.sheet-handle {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--color-text-disabled);
		opacity: 0.4;
	}

	/* ─── Header ──────────────────────────────────────── */
	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-sm) var(--space-md) var(--space-md);
		border-bottom: 1px solid var(--color-divider);
	}

	.sheet-title {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.sheet-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.sheet-close:hover {
		background: var(--color-surface-variant);
	}

	.sheet-close:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* ─── Body ────────────────────────────────────────── */
	.sheet-body {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	/* ─── Detail Fields ───────────────────────────────── */
	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-divider);
	}

	.detail-field:last-child {
		border-bottom: none;
	}

	.field-label {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-disabled);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-value {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		word-break: break-all;
	}

	.field-value-inline {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.field-value-na {
		color: var(--color-text-disabled);
		font-style: italic;
	}

	/* TASK-314: small inline metadata shown next to a primary value (e.g. fee reserve). */
	.field-meta {
		color: var(--color-text-disabled);
		font-size: var(--font-size-xs);
		margin-left: var(--space-xs);
	}

	/* ─── QR Code ──────────────────────────────────────── */
	.detail-qr {
		display: flex;
		justify-content: center;
		padding: var(--space-md) 0;
	}

	.field-value-copy {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	/* ─── Amount highlight ────────────────────────────── */
	.detail-amount {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		font-family: var(--font-family);
	}

	.amount-receive {
		color: var(--color-success);
	}

	.amount-send {
		color: var(--color-accent);
	}

	/* ─── Type icon inline ────────────────────────────── */
	.detail-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.icon-send {
		background: #00bcd4;
		color: #fff;
	}

	.icon-receive {
		background: #14b8a6;
		color: #fff;
	}

	@media (prefers-color-scheme: light) {
		.icon-send {
			background: rgba(0, 188, 212, 0.12);
			color: #00bcd4;
		}
		.icon-receive {
			background: rgba(20, 184, 166, 0.12);
			color: #14b8a6;
		}
	}

	/* ─── Badges ──────────────────────────────────────── */
	.protocol-badge,
	.status-badge {
		display: inline-block;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: #fff;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	/* Protocol colors */
	.protocol-lightning {
		background: #00bcd4;
	}

	.protocol-cashu {
		background: #8b5cf6;
	}

	@media (prefers-color-scheme: light) {
		.protocol-lightning {
			background: rgba(0, 188, 212, 0.12);
			color: #00bcd4;
		}
		.protocol-cashu {
			background: rgba(139, 92, 246, 0.12);
			color: #8b5cf6;
		}
	}

	/* Status colors */
	.status-confirmed {
		background: #14b8a6;
	}

	.status-pending {
		background: #94a3b8;
	}

	.status-failed {
		background: #ef4444;
	}

	@media (prefers-color-scheme: light) {
		.status-confirmed {
			background: rgba(20, 184, 166, 0.12);
			color: #14b8a6;
		}
		.status-pending {
			background: rgba(148, 163, 184, 0.15);
			color: #64748b;
		}
		.status-failed {
			background: rgba(239, 68, 68, 0.12);
			color: #ef4444;
		}
	}

	/* ─── Mono text ───────────────────────────────────── */
	.mono-truncate {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
		background: var(--color-surface-variant);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		word-break: break-all;
	}

	/* ─── Copy button ─────────────────────────────────── */
	.copy-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.copy-btn:hover {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
	}

	.copy-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	/* ─── Check Payment button ────────────────────────── */
	.check-btn {
		width: 100%;
		padding: 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-primary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
	}
	.check-btn:active { opacity: 0.7; }
</style>
