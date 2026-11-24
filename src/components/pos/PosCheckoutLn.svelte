<!--
  TASK-5438 rev35 equal_width_r35 — equal-width QR/camera (INTENT-054 fixforward).
  Rev35 deltas vs rev34 (mandated, all else byte-contract):
  - EQUAL WIDTH: qr-frame max-width 320 → 480 (= pos-screen 480, = lower
    invoice card) — no 320-vs-480 bottleneck; width 100% so equal at every
    breakpoint; QRDisplay (width 100% + aspect 1) scales up, square kept.
  - TASK-5604 wide frame: base 480 kept; ≥640px 720 / ≥1024px 960 follow
    .pos-screen (mockup 3/3 R4) — qr-frame + invoice-text move together.
  - Prior rev33/34 history kept below (truncated invoice, 220 QR, fit-100dvh).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import QRDisplay from '$lib/components/QRDisplay.svelte';
	import Copy from '$lib/components/icons/Copy.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	// NOTE (rev32): this component owns a `state` prop, so the `$state`
	// rune is unavailable here (`$state` would resolve as a store
	// subscription to the `state` prop). Toast feedback uses legacy
	// writable stores instead — same UI, no rune conflict.
	import { writable } from 'svelte/store';

	export type LnState = 'loading' | 'ready' | 'polling' | 'expired' | 'error';

	interface Props {
		totalSat: number;
		invoice: string;
		state: LnState;
		error?: string;
		onCopy: () => void;
		onCancel: () => void;
		onBackToBill: () => void;
		onBack: () => void;
	}

	let { totalSat, invoice, state, error = '', onCopy, onCancel, onBackToBill, onBack }: Props =
		$props();

	// rev31: same QR payload shape as Receive.svelte (lightningQrData =
	// `lightning:${quote.request}`) — reuse, not fork.
	const qrData = $derived(invoice ? `lightning:${invoice}` : '');

	// rev32: Receive handleCopyInvoice verbatim — clipboard.writeText +
	// common.copied success / common.error_clipboard error toast; parent
	// onCopy still fires (PosApp write-first fallback stays).
	let toastMessage = writable('');
	let toastType = writable<'info' | 'success' | 'error'>('info');
	let toastVisible = writable(false);

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage.set(message);
		toastType.set(type);
		toastVisible.set(true);
	}

	async function handleCopyInvoice() {
		try {
			await navigator.clipboard.writeText(invoice);
			showToast($_('common.copied'), 'success');
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		} finally {
			onCopy();
		}
	}
</script>

<div class="pos-screen" data-pos-screen="checkout-ln">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="ln-back" onclick={onBack} aria-label="back"><ArrowLeft size={24} /></button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.checkout.title_ln')}</Heading>
		<span class="header-spacer"></span>
	</div>

	<div class="amount-section">
		<div class="amount-display">
			<span class="amount-value" data-testid="ln-amount">{totalSat.toLocaleString('en-US')}</span>
			<span class="amount-unit">SAT</span>
		</div>
		{#if state === 'polling' || state === 'ready'}
			<div class="amount-secondary">{$_('pos.ln.waiting')}</div>
		{/if}
	</div>

	{#if state === 'expired'}
		<div class="error-card" data-testid="ln-expired">{$_('pos.ln.expired')}</div>
		<button type="button" class="btn btn-primary" data-testid="ln-back-to-bill" onclick={onBackToBill}>
			{$_('pos.ln.back_to_bill')}
		</button>
	{:else}
		<div class="qr-frame" data-testid="ln-qr">
			<QRDisplay data={qrData} size={220} showActions={false} />
		</div>
		<div class="invoice-text" data-testid="ln-invoice" title={invoice}>{invoice.substring(0, 40)}...</div>
		<div class="invoice-actions">
			<button type="button" class="btn btn-secondary btn-sm" data-testid="ln-copy" onclick={() => void handleCopyInvoice()}>
				<Copy size={14} /> {$_('common.copy')}
			</button>
			<button type="button" class="btn btn-ghost btn-sm" data-testid="ln-cancel" onclick={onCancel}>
				{$_('common.cancel')}
			</button>
		</div>
		<div class="toast-slot" data-testid="ln-toast">
			<Toast
				message={$toastMessage}
				type={$toastType}
				visible={$toastVisible}
				onclose={() => toastVisible.set(false)}
			/>
		</div>
		{#if state === 'polling'}
			<div class="polling-indicator" data-testid="ln-polling">
				<span class="pulse-dot"></span> UNPAID ({$_('pos.ln.waiting')})
			</div>
		{/if}
		{#if state === 'error' && error}
			<div class="error-card" data-testid="ln-error">{error}</div>
		{/if}
		{#if state === 'loading'}
			<p class="note" data-testid="ln-loading">{$_('common.loading')}</p>
		{/if}
	{/if}
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		/* rev33: whole-screen fit — amount + QR + truncated invoice +
		   Copy/Cancel + polling share one viewport, no scroll. */
		max-height: 100dvh;
		overflow: hidden;
	}
	/* TASK-5604 wide frame (approved mockup 3/3 R4): phone 480 → ≥640px 720 → ≥1024px 960, pos-only. */
	@media (min-width: 640px) {
		.pos-screen {
			max-width: 720px;
		}
	}
	@media (min-width: 1024px) {
		.pos-screen {
			max-width: 960px;
		}
	}
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
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
		flex-shrink: 0;
		font-size: 18px;
	}
	.header-spacer {
		width: 44px;
	}
	/* TASK-5440 rev36: Heading owns the middle stretch (truncate-safe). */
	.top-bar :global(h2) {
		flex: 1;
		min-width: 0;
	}
	.amount-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}
	.amount-display {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}
	.amount-value {
		font-family: var(--font-family);
		font-size: 36px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		text-align: center;
	}
	.amount-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}
	.amount-secondary {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: center;
	}
	.qr-frame {
		position: relative;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		background: #fff;
		border-radius: var(--radius-md);
		overflow: hidden;
		padding: var(--space-sm);
		box-sizing: border-box;
	}
	/* TASK-5604: QR frame follows the pos wide frame (equal width at every breakpoint). */
	@media (min-width: 640px) {
		.qr-frame {
			max-width: 720px;
		}
	}
	@media (min-width: 1024px) {
		.qr-frame {
			max-width: 960px;
		}
	}
	.invoice-text {
		font-family: var(--font-family-mono);
		word-break: break-all;
		text-align: center;
		padding: var(--space-xs) var(--space-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		box-sizing: border-box;
		font-size: 11px;
		color: var(--color-text-secondary);
		/* rev33: truncated 40+… is one short line (Receive-verbatim) */
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* TASK-5604: invoice card follows the pos wide frame (equal width at every breakpoint). */
	@media (min-width: 640px) {
		.invoice-text {
			max-width: 720px;
		}
	}
	@media (min-width: 1024px) {
		.invoice-text {
			max-width: 960px;
		}
	}
	.invoice-actions {
		display: flex;
		gap: var(--space-sm);
	}
	.invoice-actions .btn {
		width: auto;
		flex: 1;
	}
	.toast-slot {
		display: flex;
		justify-content: center;
		min-height: 0;
	}
	.polling-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		justify-content: center;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}
	.pulse-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-primary);
	}
	.error-card {
		background: var(--color-error-light);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		border: 1.5px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		min-height: 44px;
		font-size: var(--font-size-sm);
		padding: var(--space-sm) var(--space-md);
		width: 100%;
	}
	.btn-primary {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary);
	}
	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		border-color: var(--color-primary);
	}
	.btn-ghost {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
	}
	.btn-sm {
		font-size: var(--font-size-xs);
		border-radius: var(--radius-sm);
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
</style>
