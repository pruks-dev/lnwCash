<script lang="ts">
	/**
	 * Send Screen — consolidate Pay + Transfer
	 * Invoice input → confirm → send flow
	 * Uses TASK-050: Card, Button, Input, Modal, Heading, Body, Icons, Toast
	 */
	import { _ } from 'svelte-i18n';
	import { meltFlow, type MeltResult } from '$lib/wallet/melt';
	import { InsufficientFundsError } from '$lib/wallet/errors';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';

	// TASK-050 Icons
	import SendIcon from '$lib/components/icons/Send.svelte';
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
	let result: MeltResult | null = $state(null);
	let showConfirm: boolean = $state(false);
	let toastMessage: string = $state('');
	let toastType: 'info' | 'success' | 'error' = $state('info');
	let toastVisible: boolean = $state(false);

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
	}

	function startPay() {
		error = '';
		if (!invoice.trim() && amount <= 0) {
			error = $_('screen.send.error_insufficient');
			showToast(error, 'error');
			return;
		}
		if (!mintUrl.trim()) {
			error = $_('common.error_mint_url_required');
			return;
		}
		showConfirm = true;
	}

	async function confirmPay() {
		error = '';
		loading = true;
		try {
			const res = await meltFlow(mintUrl.trim(), invoice.trim() || 'dummy_invoice', amount || 1);
			result = res;
			showConfirm = false;
			if (!res.success) {
				error = res.error || $_('screen.send.error_melt_fail');
				showToast(error, 'error');
			} else {
				showToast($_('screen.send.success'), 'success');
			}
		} catch (e) {
			if (e instanceof InsufficientFundsError) {
				error = $_('screen.send.error_insufficient');
			} else {
				error = e instanceof Error ? e.message : $_('screen.send.error_melt_fail');
			}
			showToast(error, 'error');
		} finally {
			loading = false;
		}
	}

	function cancelPay() {
		showConfirm = false;
	}

	function clearResult() {
		result = null;
		error = '';
		invoice = '';
		amount = 0;
	}

	function handleScan() {
		onQRScan?.();
	}

	async function handlePaste() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				if (text.startsWith('lnbc') || text.startsWith('lntb') || text.startsWith('cashu')) {
					invoice = text;
				} else {
					// Try parsing as amount
					const num = Number(text);
					if (!isNaN(num) && num > 0) {
						amount = num;
					}
				}
			}
		} catch {
			// Clipboard access denied
		}
	}
</script>

<div class="send-screen" role="main" aria-label={$_('screen.send.title')}>

	<Heading level="h2" align="center">{$_('screen.send.title')}</Heading>

	{#if result?.success}
		<!-- ─── Success State ─────────────────────────── -->
		<Card variant="basic" padding="lg">
			<div class="success-card">
				<span class="success-icon" aria-hidden="true">
					<Check size={48} />
				</span>
				<Heading level="h3" align="center">{$_('screen.send.success')}</Heading>
				<div class="result-details">
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.send.amount')}</Body>
						<Body size="sm" weight="semibold">{result.spentAmount} {$_('screen.balance.sats')}</Body>
					</div>
					{#if result.feeReserve}
						<div class="detail-row">
							<Body size="sm" color="secondary">{$_('screen.send.fee')}</Body>
							<Body size="sm" weight="semibold">{result.feeReserve} {$_('screen.balance.sats')}</Body>
						</div>
					{/if}
				</div>
				<Button variant="primary" onclick={clearResult}>
					{#snippet children()}{$_('common.ok')}{/snippet}
				</Button>
			</div>
		</Card>
	{:else}
		<!-- ─── Input Form ─────────────────────────────── -->
		<Card variant="basic" padding="lg">
			<div class="form">
				<Input
					type="text"
					label={$_('screen.send.invoice_label')}
					value={invoice}
					placeholder={$_('screen.send.invoice_placeholder')}
					disabled={loading}
					oninput={(e) => invoice = (e.target as HTMLInputElement).value}
				/>

				<Input
					type="number"
					label={$_('screen.send.amount_label')}
					value={amount}
					placeholder={$_('screen.send.amount_placeholder')}
					min={1}
					disabled={loading}
					oninput={(e) => amount = Number((e.target as HTMLInputElement).value) || 0}
				/>

				<div class="form-actions">
					<Button variant="ghost" size="sm" onclick={handlePaste} disabled={loading}>
						{#snippet children()}{$_('screen.send.paste_invoice')}{/snippet}
					</Button>
					<Button variant="ghost" size="sm" onclick={handleScan} disabled={loading}>
						{#snippet children()}
							<Scan size={16} />
							{$_('screen.send.scan_qr')}
						{/snippet}
					</Button>
				</div>
			</div>
		</Card>

		<!-- ─── Error ─────────────────────────────────── -->
		{#if error}
			<div class="error-banner" role="alert">
				<Body size="sm">{error}</Body>
			</div>
		{/if}

		<!-- ─── Action Button ─────────────────────────── -->
		<div class="button-row">
			<Button variant="primary" size="lg" onclick={startPay} disabled={loading}>
				{#snippet children()}
					<SendIcon size={18} />
					{$_('screen.send.pay_button')}
				{/snippet}
			</Button>
		</div>
	{/if}

	<!-- ─── Confirm Modal ─────────────────────────────────── -->
	<Modal open={showConfirm} onclose={cancelPay} ariaLabel={$_('screen.send.confirm_title')}>
		{#snippet children()}
			<Heading level="h3" align="center">{$_('screen.send.confirm_title')}</Heading>
			<div class="confirm-details">
				<div class="detail-row">
					<Body size="sm" color="secondary">{$_('screen.send.amount')}</Body>
					<Body size="sm" weight="semibold">{amount || 1} {$_('screen.balance.sats')}</Body>
				</div>
				{#if invoice}
					<div class="detail-row">
						<Body size="sm" color="secondary">Invoice</Body>
						<Body size="sm" weight="semibold" truncate>
							{invoice.substring(0, 20)}...
						</Body>
					</div>
				{/if}
			</div>
			<div class="confirm-buttons">
				<Button variant="secondary" size="md" onclick={cancelPay} disabled={loading}>
					{#snippet children()}{$_('common.cancel')}{/snippet}
				</Button>
				<Button variant="primary" size="md" loading={loading} onclick={confirmPay}>
					{#snippet children()}
						{loading ? $_('screen.send.paying') : $_('screen.send.pay_button')}
					{/snippet}
				</Button>
			</div>
		{/snippet}
	</Modal>

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
	.send-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.form-actions {
		display: flex;
		gap: var(--space-sm);
	}

	/* Success */
	.success-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	.success-icon {
		color: var(--color-success);
	}

	.result-details,
	.confirm-details {
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

	.confirm-buttons {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-md);
	}

	/* Error */
	.error-banner {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-error-light);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-error);
	}

	.button-row {
		display: flex;
		flex-direction: column;
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
