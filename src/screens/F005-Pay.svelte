<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { meltFlow, type MeltResult } from '$lib/wallet/melt';
	import { InsufficientFundsError } from '$lib/wallet/errors';

	interface Props {
		defaultMintUrl?: string;
		onQRScan?: () => void;
	}

	let { defaultMintUrl = '', onQRScan }: Props = $props();

	let invoice: string = $state('');
	function getInitialMint(): string {
		return defaultMintUrl;
	}
	let mintUrl: string = $state(getInitialMint());
	let amount: number = $state(0);
	let loading: boolean = $state(false);
	let error: string = $state('');
	let result: MeltResult | null = $state(null);
	let showConfirm: boolean = $state(false);

	function clearResult() {
		result = null;
		error = '';
		showConfirm = false;
	}

	function startPay() {
		error = '';
		if (!invoice.trim() && amount <= 0) {
			error = $_('screen.pay.error_insufficient');
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
			const res = await meltFlow(mintUrl.trim(), invoice.trim() || 'dummy_invoice_for_amount', amount || 1);
			result = res;
			showConfirm = false;
			if (!res.success) {
				error = res.error || $_('screen.pay.error_melt_fail');
			}
		} catch (e) {
			if (e instanceof InsufficientFundsError) {
				error = $_('screen.pay.error_insufficient');
			} else {
				error = e instanceof Error ? e.message : $_('screen.pay.error_melt_fail');
			}
		} finally {
			loading = false;
		}
	}

	function cancelPay() {
		showConfirm = false;
	}

	function handleScan() {
		onQRScan?.();
	}
</script>

<div class="pay-screen">
	<h2 class="title">{$_('screen.pay.title')}</h2>

	{#if result?.success}
		<div class="success-card">
			<span class="success-icon">&#10003;</span>
			<span class="success-text">{$_('screen.pay.success')}</span>
			<div class="result-details">
				<div class="detail-row">
					<span class="detail-label">{$_('screen.pay.amount')}</span>
					<span class="detail-value">{result.spentAmount} {$_('screen.balance.sats')}</span>
				</div>
				{#if result.feeReserve}
					<div class="detail-row">
						<span class="detail-label">{$_('screen.pay.fee')}</span>
						<span class="detail-value">{result.feeReserve} {$_('screen.balance.sats')}</span>
					</div>
				{/if}
			</div>
			<button type="button" class="action-btn" onclick={clearResult}>
				{$_('common.ok')}
			</button>
		</div>
	{:else if showConfirm}
		<div class="confirm-card">
			<h3>{$_('screen.pay.confirm_title')}</h3>
			<div class="confirm-details">
				<div class="detail-row">
					<span class="detail-label">{$_('screen.pay.amount')}</span>
					<span class="detail-value">{amount || 1} {$_('screen.balance.sats')}</span>
				</div>
				{#if invoice}
					<div class="detail-row">
						<span class="detail-label">Invoice</span>
						<span class="detail-value mono">{invoice.substring(0, 20)}...</span>
					</div>
				{/if}
			</div>
			{#if error}
				<p class="error-message" role="alert">{error}</p>
			{/if}
			<div class="confirm-buttons">
				<button type="button" class="cancel-btn" onclick={cancelPay} disabled={loading}>
					{$_('common.cancel')}
				</button>
				<button type="button" class="pay-btn" onclick={confirmPay} disabled={loading}>
					{#if loading}
						{$_('screen.pay.paying')}
					{:else}
						{$_('screen.pay.pay_button')}
					{/if}
				</button>
			</div>
		</div>
	{:else}
		<div class="form">
			<div class="input-group">
				<span class="label-text">{$_('screen.wallet.mint_url_label')}</span>
				<input
					type="url"
					bind:value={mintUrl}
					placeholder="https://mint.example.com"
					disabled={loading}
					class="text-input"
				/>
			</div>

			<div class="input-group">
				<span class="label-text">{$_('screen.pay.enter_invoice')}</span>
				<input
					type="text"
					bind:value={invoice}
					placeholder="lnbc..."
					disabled={loading}
					class="text-input"
				/>
			</div>

			<div class="input-group">
				<span class="label-text">{$_('screen.pay.amount')} ({$_('screen.balance.sats')})</span>
				<input
					type="number"
					bind:value={amount}
					placeholder="0"
					min="1"
					disabled={loading}
					class="text-input"
				/>
			</div>

			{#if error}
				<p class="error-message" role="alert">{error}</p>
			{/if}

			<div class="button-row">
				<button type="button" class="pay-btn" onclick={startPay} disabled={loading}>
					{$_('screen.pay.pay_button')}
				</button>
				<button type="button" class="scan-btn" onclick={handleScan} disabled={loading}>
					{$_('screen.pay.scan_qr')}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.pay-screen {
		max-width: 420px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.title {
		font-size: 1.3rem;
		color: #f7931a;
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.label-text {
		font-size: 0.85rem;
		color: #555;
		font-weight: 600;
	}

	.text-input {
		padding: 0.7rem 0.85rem;
		font-size: 0.95rem;
		border: 2px solid #e0e0e0;
		border-radius: 10px;
		outline: none;
		transition: border-color 0.2s;
		font-family: monospace;
	}

	.text-input:focus {
		border-color: #f7931a;
	}

	.text-input:disabled {
		opacity: 0.6;
		background: #f5f5f5;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		margin: 0;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
	}

	.button-row {
		display: flex;
		gap: 0.75rem;
	}

	.pay-btn {
		flex: 1;
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 700;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 12px;
		cursor: pointer;
	}

	.pay-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.scan-btn {
		padding: 0.85rem 1.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #f7931a;
		background: white;
		border: 2px solid #f7931a;
		border-radius: 12px;
		cursor: pointer;
	}

	.scan-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.success-card,
	.confirm-card {
		text-align: center;
		padding: 2rem 1rem;
		border-radius: 16px;
		border: 1px solid;
	}

	.success-card {
		background: #d4edda;
		border-color: #c3e6cb;
	}

	.confirm-card {
		background: #fff8f0;
		border-color: #f7931a40;
	}

	.confirm-card h3 {
		margin: 0 0 1rem;
		color: #333;
	}

	.success-icon {
		font-size: 2.5rem;
		color: #28a745;
		display: block;
		margin-bottom: 0.5rem;
	}

	.success-text {
		font-size: 1.1rem;
		font-weight: 700;
		color: #155724;
		display: block;
		margin-bottom: 1rem;
	}

	.result-details,
	.confirm-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid #e0e0e0;
	}

	.detail-label {
		font-size: 0.85rem;
		color: #555;
	}

	.detail-value {
		font-weight: 700;
		color: #333;
	}

	.detail-value.mono {
		font-family: monospace;
		font-size: 0.8rem;
	}

	.confirm-buttons {
		display: flex;
		gap: 0.75rem;
	}

	.cancel-btn {
		flex: 1;
		padding: 0.7rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #888;
		background: #f0f0f0;
		border: none;
		border-radius: 10px;
		cursor: pointer;
	}

	.action-btn {
		padding: 0.6rem 2rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		background: #28a745;
		border: none;
		border-radius: 10px;
		cursor: pointer;
	}
</style>
