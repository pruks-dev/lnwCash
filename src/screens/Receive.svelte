<script lang="ts">
	/**
	 * Receive Screen — consolidate Receive + QR
	 * Lightning invoice display + QR placeholder + copy button + share
	 * Uses TASK-050: Card, Button, Input, Heading, Body, Icons, Toast
	 */
	import { _ } from 'svelte-i18n';
	import { mintFlow, type MintResult } from '$lib/wallet/mint';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';

	// TASK-050 Icons
	import Copy from '$lib/components/icons/Copy.svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import Scan from '$lib/components/icons/Scan.svelte';

	interface Props {
		defaultMintUrl?: string;
		onQRScan?: () => void;
	}

	let { defaultMintUrl = '', onQRScan }: Props = $props();

	let invoice: string = $state('');
	let amount: number = $state(0);
	let mintUrl: string = $state('');
	let loading: boolean = $state(false);

	$effect(() => {
		if (defaultMintUrl && !mintUrl) {
			mintUrl = defaultMintUrl;
		}
	});
	let error: string = $state('');
	let result: MintResult | null = $state(null);
	let lightningInvoice: string = $state('');
	let copiedToast: boolean = $state(false);
	let toastMessage: string = $state('');
	let toastType: 'info' | 'success' | 'error' = $state('info');
	let toastVisible: boolean = $state(false);

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
	}

	async function handleMint() {
		error = '';
		if (!invoice.trim() && amount <= 0) {
			error = $_('screen.receive.error_invalid_invoice');
			return;
		}
		if (!mintUrl.trim()) {
			error = $_('common.error_mint_url_required');
			return;
		}

		loading = true;
		try {
			const res = await mintFlow(mintUrl.trim(), amount || 100);
			result = res;
			if (!res.success) {
				error = res.error || $_('screen.receive.error_mint_fail');
				showToast(error, 'error');
			} else {
				showToast($_('screen.receive.success'), 'success');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $_('screen.receive.error_mint_fail');
			showToast(error, 'error');
		} finally {
			loading = false;
		}
	}

	async function handleCopy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			showToast($_('screen.receive.invoice_copied'), 'success');
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		}
	}

	async function handleShare(text: string) {
		if (navigator.share) {
			try {
				await navigator.share({ text });
			} catch {
				// User cancelled or not supported
			}
		} else {
			await handleCopy(text);
		}
	}

	function clearResult() {
		result = null;
		error = '';
	}

	function handleScan() {
		onQRScan?.();
	}
</script>

<div class="receive-screen" role="main" aria-label={$_('screen.receive.title')}>

	<Heading level="h2" align="center">{$_('screen.receive.title')}</Heading>

	{#if result?.success}
		<!-- ─── Success State ─────────────────────────── -->
		<Card variant="basic" padding="lg">
			<div class="success-card">
				<span class="success-icon" aria-hidden="true">
					<Check size={48} />
				</span>
				<Heading level="h3" align="center">{$_('screen.receive.success')}</Heading>
				<div class="result-details">
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.receive.amount_received')}</Body>
						<Body size="sm" weight="semibold">{result.amount} {$_('screen.balance.sats')}</Body>
					</div>
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.receive.proof_count')}</Body>
						<Body size="sm" weight="semibold">{result.proofs.length}</Body>
					</div>
				</div>
				<Button variant="primary" onclick={clearResult}>
					{#snippet children()}{$_('common.ok')}{/snippet}
				</Button>
			</div>
		</Card>
	{:else}
		<!-- ─── Lightning Invoice Display ─────────────── -->
		<Card variant="basic" padding="lg">
			<div class="invoice-section">
				<Heading level="h3">{$_('screen.receive.lightning_invoice')}</Heading>

				<Input
					type="text"
					label={$_('screen.receive.amount')}
					value={amount}
					placeholder="0"
					min={1}
					disabled={loading}
					oninput={(e) => amount = Number((e.target as HTMLInputElement).value) || 0}
				/>

				<Input
					type="text"
					label={$_('screen.receive.enter_invoice')}
					value={invoice}
					placeholder={$_('screen.receive.invoice_placeholder')}
					disabled={loading}
					oninput={(e) => invoice = (e.target as HTMLInputElement).value}
				/>

				{#if lightningInvoice}
					<div class="qr-placeholder">
						<div class="qr-box">
							<Body size="sm" color="disabled">[QR Code]</Body>
						</div>
						<div class="invoice-actions">
							<Button variant="secondary" size="sm" onclick={() => handleCopy(lightningInvoice)}>
								{#snippet children()}<Copy size={14} /> {$_(`common.copy`)}{/snippet}
							</Button>
							<Button variant="secondary" size="sm" onclick={() => handleShare(lightningInvoice)}>
								{#snippet children()}{$_(`common.share`)}{/snippet}
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</Card>

		<!-- ─── Error ─────────────────────────────────── -->
		{#if error}
			<div class="error-banner" role="alert">
				<Body size="sm" color="text">{error}</Body>
			</div>
		{/if}

		<!-- ─── Action Buttons ────────────────────────── -->
		<div class="button-row">
			<Button variant="primary" size="lg" loading={loading} onclick={handleMint}>
				{#snippet children()}
					{loading ? $_('screen.receive.minting') : $_('screen.receive.mint_button')}
				{/snippet}
			</Button>

			<Button variant="secondary" size="lg" onclick={handleScan} disabled={loading}>
				{#snippet children()}
					<Scan size={18} />
					{$_('screen.receive.scan_qr')}
				{/snippet}
			</Button>
		</div>
	{/if}

	<!-- Toast -->
	<div class="toast-container">
		<Toast
			message={toastMessage}
			type={toastType}
			visible={toastVisible}
			onclose={() => toastVisible = false}
		/>
	</div>

	<div class="bottom-spacer"></div>
</div>

<style>
	.receive-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.invoice-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.qr-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		margin-top: var(--space-sm);
	}

	.qr-box {
		width: 180px;
		height: 180px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
	}

	.invoice-actions {
		display: flex;
		gap: var(--space-sm);
	}

	/* Success State */
	.success-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	.success-icon {
		color: var(--color-success);
	}

	.result-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) 0;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-border);
	}

	/* Error */
	.error-banner {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-error-light);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-error);
	}

	/* Button Row */
	.button-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.toast-container {
		position: fixed;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-toast);
		max-width: 360px;
		width: calc(100% - 2 * var(--space-md));
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
