<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { mintFlow, type MintResult } from '$lib/wallet/mint';

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
	let result: MintResult | null = $state(null);

	function clearResult() {
		result = null;
		error = '';
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
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $_('screen.receive.error_mint_fail');
		} finally {
			loading = false;
		}
	}

	function handleScan() {
		onQRScan?.();
	}
</script>

<div class="receive-screen">
	<h2 class="title">{$_('screen.receive.title')}</h2>

	{#if result?.success}
		<div class="success-card">
			<span class="success-icon">&#10003;</span>
			<span class="success-text">{$_('screen.receive.success')}</span>
			<div class="result-details">
				<div class="detail-row">
					<span class="detail-label">{$_('screen.receive.amount_received')}</span>
					<span class="detail-value">{result.amount} {$_('screen.balance.sats')}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">{$_('screen.receive.proof_count')}</span>
					<span class="detail-value">{result.proofs.length}</span>
				</div>
			</div>
			<button type="button" class="action-btn" onclick={clearResult}>
				{$_('common.ok')}
			</button>
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
				<span class="label-text">{$_('screen.receive.enter_invoice')}</span>
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
				<button type="button" class="mint-btn" onclick={handleMint} disabled={loading}>
					{#if loading}
						{$_('screen.receive.minting')}
					{:else}
						{$_('screen.receive.mint_button')}
					{/if}
				</button>
				<button type="button" class="scan-btn" onclick={handleScan} disabled={loading}>
					{$_('screen.receive.scan_qr')}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.receive-screen {
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

	.mint-btn {
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

	.mint-btn:disabled {
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

	.success-card {
		text-align: center;
		padding: 2rem 1rem;
		background: #d4edda;
		border-radius: 16px;
		border: 1px solid #c3e6cb;
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

	.result-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid #c3e6cb;
	}

	.detail-label {
		font-size: 0.85rem;
		color: #555;
	}

	.detail-value {
		font-weight: 700;
		color: #155724;
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
