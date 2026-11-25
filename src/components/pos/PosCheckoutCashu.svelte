<!--
  TASK-5438 rev35 equal_width_r35 — equal-width camera (INTENT-054 fixforward).
  Rev35 deltas vs rev34 (mandated, all else byte-contract):
  - EQUAL WIDTH: qr-live / qr-scanner max-width 320 → 480 (= pos-screen 480,
    = lower paste Card full-width) — no 320-vs-480 bottleneck; width 100%
    so equal at every breakpoint; aspect-ratio 1/1 KEPT (square, never 4/3).
  - TASK-5604 wide frame: base 480 kept; ≥640px 720 / ≥1024px 960 follow
    .pos-screen (mockup 3/3 R4) — qr-live + qr-scanner move together.
  - Prior rev34 history kept below (square camera, paste buttons-only,
    wallet Button/Card theme sweep, no scanner fork).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import QRScanner from '$lib/components/QRScanner.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	// NOTE (rev32): this component owns a `state` prop, so the `$state`
	// rune is unavailable here (`$state` would resolve as a store
	// subscription to the `state` prop). Toast feedback uses legacy
	// writable stores instead — same UI, no rune conflict.
	import { writable } from 'svelte/store';

	export type CashuState = 'idle' | 'under' | 'exact' | 'over' | 'invalid' | 'receiving';

	interface Props {
		totalSat: number;
		/**
		 * TASK-5711 frozen bill fiat (INTENT-057 BLUEPRINT v3): the bill
		 * fiat snapshot text at pay time — rendered verbatim, NEVER
		 * recomputed (old bills freeze). Empty = pre-freeze/legacy path.
		 */
		fiatText?: string;
		receivedSat: number;
		state: CashuState;
		// Rev34: retained for the PosApp contract (parent owns the clipboard
		// buffer; submit reads parent state) — the paste path is buttons-only,
		// so the child no longer displays it (no textarea, never typed).
		pasted: string;
		scanning?: boolean;
		onPasted: (v: string) => void;
		onDecodeToken?: (v: string) => void;
		onCloseScanner?: () => void;
		onSubmitToken: () => void;
		onScanAnother: () => void;
		onConfirm: () => void;
		onBack: () => void;
	}

	let {
		totalSat,
		fiatText = '',
		receivedSat,
		state,
		scanning = false,
		onPasted,
		onDecodeToken = () => {},
		onCloseScanner = () => {},
		onSubmitToken,
		onScanAnother,
		onConfirm,
		onBack
	}: Props = $props();

	const shortfall = $derived(totalSat - receivedSat);

	// ─── Toast (Receive-verbatim feedback: clipboard error only) ───
	const toastMessage = writable('');
	const toastType = writable<'info' | 'success' | 'error'>('info');
	const toastVisible = writable(false);

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage.set(message);
		toastType.set(type);
		toastVisible.set(true);
	}

	// ─── Paste (Receive handlePasteToken verbatim, PoS-adapted) ───
	// Receive: clipboard.readText → fill input → validateToken() (preview).
	// PoS has no preview state, so validate == submit through the same
	// receive path as Confirm (onSubmitToken). Clipboard failure →
	// error_clipboard toast (same key as Receive). Empty clipboard → no-op.
	// Rev34: no typing — clipboard is the ONLY way in (buttons-only).
	async function handlePaste() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				onPasted(text);
				onSubmitToken();
			}
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		}
	}
</script>

<div class="pos-screen" data-pos-screen="checkout-cashu">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="cashu-back" onclick={onBack} aria-label="back"><ArrowLeft size={24} /></button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.checkout.title_cashu')}</Heading>
		<span class="header-spacer"></span>
	</div>

	<div class="amount-section">
		<div class="amount-display">
			<span class="amount-value" data-testid="cashu-amount">
				{state === 'idle' ? totalSat.toLocaleString('en-US') : receivedSat.toLocaleString('en-US')}
			</span>
			<span class="amount-unit">SAT{state === 'idle' ? '' : ' received'}</span>
		</div>
		{#if fiatText}
			<div class="amount-secondary" data-testid="cashu-fiat">{fiatText}</div>
		{/if}
		{#if state === 'idle'}
			<div class="amount-secondary">{$_('pos.cashu.prompt')}</div>
		{:else if state === 'under'}
			<div class="amount-secondary">bill {totalSat.toLocaleString('en-US')} (shortfall −{shortfall.toLocaleString('en-US')})</div>
		{:else if state === 'exact'}
			<div class="amount-secondary">bill {totalSat.toLocaleString('en-US')} (exact match)</div>
		{:else if state === 'over'}
			<div class="amount-secondary">bill {totalSat.toLocaleString('en-US')} (over +{(receivedSat - totalSat).toLocaleString('en-US')} change-due)</div>
		{/if}
	</div>

	{#if state === 'idle' || state === 'invalid'}
		{#if scanning}
			<div class="qr-live" data-testid="cashu-scanner">
				<!-- TASK-5440 rev36 hide_x_pos_r36: PoS Cashu hides the QRScanner X
				 (hideClose) — exit owns to the header back button; paste stays. -->
				<QRScanner onDecode={onDecodeToken} onClose={onCloseScanner} hideClose />
			</div>
		{:else}
			<div class="qr-scanner" data-testid="cashu-qr">camera preview</div>
		{/if}
		<div data-testid="cashu-paste-card">
			<Card variant="basic" padding="sm">
				<div class="paste-inner">
					<span class="note">{$_('pos.cashu.paste_label')}</span>
					<div class="paste-actions">
						<Button variant="secondary" size="sm" onclick={() => void handlePaste()} ariaLabel={$_('common.paste')}>
							{#snippet children()}<span data-testid="cashu-paste-btn">{$_('common.paste')}</span>{/snippet}
						</Button>
						<Button variant="primary" size="sm" onclick={onSubmitToken} ariaLabel={$_('pos.cashu.confirm')}>
							{#snippet children()}<span data-testid="cashu-submit">{$_('pos.cashu.confirm')}</span>{/snippet}
						</Button>
					</div>
				</div>
			</Card>
		</div>
		{#if state === 'invalid'}
			<div class="error-card" data-testid="cashu-invalid">{$_('pos.cashu.invalid')}</div>
		{/if}
		<div class="toast-slot" data-testid="cashu-toast">
			<Toast
				message={$toastMessage}
				type={$toastType}
				visible={$toastVisible}
				onclose={() => toastVisible.set(false)}
			/>
		</div>
	{:else if state === 'under'}
		<span class="pill pill-warn" style="align-self:center" data-testid="cashu-pill-under">
			{$_('pos.cashu.under')}
		</span>
		<Card variant="basic" padding="md">
			<span class="note">Partial NOT recorded as sale (record-only on EXACT/OVER-complete).</span>
		</Card>
		<div class="action-col">
			<Button variant="secondary" onclick={onScanAnother} ariaLabel={$_('pos.cashu.scan_another')}>
				{#snippet children()}<span data-testid="cashu-scan-another">{$_('pos.cashu.scan_another')}</span>{/snippet}
			</Button>
		</div>
	{:else if state === 'exact'}
		<span class="pill pill-ok" style="align-self:center" data-testid="cashu-pill-exact">
			{$_('pos.cashu.exact')} {receivedSat.toLocaleString('en-US')} = {totalSat.toLocaleString('en-US')}
		</span>
		<div class="action-col">
			<Button variant="primary" onclick={onConfirm} ariaLabel={$_('pos.cashu.confirm')}>
				{#snippet children()}<span data-testid="cashu-confirm">{$_('pos.cashu.confirm')}</span>{/snippet}
			</Button>
		</div>
	{:else if state === 'over'}
		<span class="pill pill-cashu" style="align-self:center" data-testid="cashu-pill-over">
			{$_('pos.cashu.over')}
		</span>
		<Card variant="basic" padding="md">
			<span class="note">No auto-change-token in v1; change-due shown on success + history.</span>
		</Card>
		<div class="action-col">
			<Button variant="primary" onclick={onConfirm} ariaLabel={$_('pos.cashu.confirm')}>
				{#snippet children()}<span data-testid="cashu-confirm">{$_('pos.cashu.confirm')}</span>{/snippet}
			</Button>
		</div>
	{:else if state === 'receiving'}
		<p class="note" data-testid="cashu-loading">{$_('common.loading')}</p>
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
		/* rev34: whole-screen fit — square camera + paste buttons + toast
		   share one viewport, no scroll. */
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
	.qr-live {
		position: relative;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		border-radius: var(--radius-md);
		overflow: hidden;
		/* rev34: square camera — portrait-friendly, NEVER landscape 4/3. */
		aspect-ratio: 1 / 1;
	}
	.qr-scanner {
		position: relative;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		background: #000;
		border-radius: var(--radius-md);
		overflow: hidden;
		/* rev34: square preview matches the live camera (never 4/3). */
		aspect-ratio: 1 / 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: var(--font-size-sm);
		text-align: center;
	}
	/* TASK-5604: camera + scanner follow the pos wide frame (equal width at every breakpoint). */
	@media (min-width: 640px) {
		.qr-live,
		.qr-scanner {
			max-width: 720px;
		}
	}
	@media (min-width: 1024px) {
		.qr-live,
		.qr-scanner {
			max-width: 960px;
		}
	}
	.pill {
		display: inline-flex;
		align-items: center;
		padding: var(--space-xs) var(--space-sm);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		border-radius: var(--radius-full);
		border: 1.5px solid transparent;
		white-space: nowrap;
	}
	.pill-ok {
		background: var(--color-success-light);
		color: var(--color-success);
	}
	.pill-warn {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}
	.pill-cashu {
		background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
		color: var(--color-secondary);
	}
	.error-card {
		background: var(--color-error-light);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
	/* rev34: wallet Card owns the paste surface — inner stack only. */
	.paste-inner {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.paste-actions {
		display: flex;
		gap: var(--space-sm);
	}
	.paste-actions :global(button) {
		flex: 1;
	}
	.action-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.action-col :global(button) {
		width: 100%;
	}
	.toast-slot {
		display: flex;
		justify-content: center;
		min-height: 0;
	}
</style>
