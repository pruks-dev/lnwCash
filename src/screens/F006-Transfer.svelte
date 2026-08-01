<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { sendTokens, receiveTokens, type SendResult, type ReceiveResult } from '$lib/wallet/transfer';
	import { encodeToken } from '$lib/cashu/token';
	import { getUnspentProofsByMint } from '$lib/wallet/proofsDb';
	import { selectProofs } from '$lib/wallet/proofs';
	import { InsufficientFundsError, TokenValidationError } from '$lib/wallet/errors';

	interface Props {
		defaultMintUrl?: string;
	}

	let { defaultMintUrl = '' }: Props = $props();

	let activeTab: 'send' | 'receive' = $state('send');
	let sendAmount: number = $state(0);
	function getInitialMint(): string {
		return defaultMintUrl;
	}
	let sendMintUrl: string = $state(getInitialMint());
	let receveTokenStr: string = $state('');
	let loading: boolean = $state(false);
	let error: string = $state('');
	let sendResult: SendResult | null = $state(null);
	let receiveResult: ReceiveResult | null = $state(null);
	let copied: boolean = $state(false);

	function clearMessages() {
		error = '';
		sendResult = null;
		receiveResult = null;
		copied = false;
	}

	function switchTab(tab: 'send' | 'receive') {
		activeTab = tab;
		clearMessages();
	}

	async function handleSend() {
		error = '';
		if (sendAmount <= 0) {
			error = $_('screen.transfer.error_send');
			return;
		}
		if (!sendMintUrl.trim()) {
			error = $_('screen.wallet.mint_url_label');
			return;
		}

		loading = true;
		try {
			sendResult = await sendTokens(sendAmount, sendMintUrl.trim());
		} catch (e) {
			if (e instanceof InsufficientFundsError) {
				error = $_('screen.pay.error_insufficient');
			} else {
				error = e instanceof Error ? e.message : $_('screen.transfer.error_send');
			}
		} finally {
			loading = false;
		}
	}

	async function handleReceive() {
		error = '';
		if (!receveTokenStr.trim()) {
			error = $_('screen.transfer.error_receive');
			return;
		}

		loading = true;
		try {
			receiveResult = await receiveTokens(receveTokenStr.trim());
		} catch (e) {
			if (e instanceof TokenValidationError) {
				error = $_('screen.transfer.error_receive');
			} else {
				error = e instanceof Error ? e.message : $_('screen.transfer.error_receive');
			}
		} finally {
			loading = false;
		}
	}

	async function copyToken() {
		if (!sendResult?.token) return;
		try {
			await navigator.clipboard.writeText(sendResult.token);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			error = $_('common.error_clipboard');
		}
	}
</script>

<div class="transfer-screen">
	<h2 class="title">{$_('screen.transfer.title')}</h2>

	<div class="tabs">
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'send'}
			onclick={() => switchTab('send')}
		>
			{$_('screen.transfer.tab_send')}
		</button>
		<button
			type="button"
			class="tab"
			class:active={activeTab === 'receive'}
			onclick={() => switchTab('receive')}
		>
			{$_('screen.transfer.tab_receive')}
		</button>
	</div>

	{#if activeTab === 'send'}
		<div class="tab-content">
			{#if sendResult}
				<div class="result-card">
					<span class="send-success-text">{$_('screen.transfer.send_success')}</span>
					<div class="result-detail">
						<span class="detail-label">{$_('screen.pay.amount')}</span>
						<span class="detail-value">{sendResult.amount} {$_('screen.balance.sats')}</span>
					</div>
					<div class="token-display">
						<code class="token-text">{sendResult.token.substring(0, 50)}...</code>
					</div>
					<button type="button" class="copy-btn" onclick={copyToken}>
						{copied ? $_('screen.transfer.copied') : $_('screen.transfer.copy_token')}
					</button>
					<button type="button" class="reset-btn" onclick={clearMessages}>
						{$_('common.ok')}
					</button>
				</div>
			{:else}
				<div class="form">
					<div class="input-group">
						<span class="label-text">{$_('screen.wallet.mint_url_label')}</span>
						<input
							type="url"
							bind:value={sendMintUrl}
							placeholder="https://mint.example.com"
							disabled={loading}
							class="text-input"
						/>
					</div>
					<div class="input-group">
						<span class="label-text">{$_('screen.transfer.send_amount')}</span>
						<input
							type="number"
							bind:value={sendAmount}
							placeholder="0"
							min="1"
							disabled={loading}
							class="text-input"
						/>
					</div>

					{#if error}
						<p class="error-message" role="alert">{error}</p>
					{/if}

					<button type="button" class="action-btn" onclick={handleSend} disabled={loading}>
						{#if loading}
							{$_('common.loading')}
						{:else}
							{$_('screen.transfer.send_button')}
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="tab-content">
			{#if receiveResult}
				<div class="result-card success">
					<span class="send-success-text">{$_('screen.transfer.receive_success')}</span>
					<div class="result-detail">
						<span class="detail-label">{$_('screen.transfer.incoming_amount')}</span>
						<span class="detail-value">{receiveResult.amount} {$_('screen.balance.sats')}</span>
					</div>
					<div class="result-detail">
						<span class="detail-label">Mint</span>
						<span class="detail-value">{receiveResult.mint}</span>
					</div>
					<div class="result-detail">
						<span class="detail-label">{$_('screen.receive.proof_count')}</span>
						<span class="detail-value">{receiveResult.proofCount}</span>
					</div>
					<button type="button" class="reset-btn" onclick={clearMessages}>
						{$_('common.ok')}
					</button>
				</div>
			{:else}
				<div class="form">
					<div class="input-group">
						<span class="label-text">{$_('screen.transfer.paste_token')}</span>
						<textarea
							bind:value={receveTokenStr}
							placeholder="cashuA..."
							disabled={loading}
							class="text-area"
							rows="3"
						></textarea>
					</div>

					{#if error}
						<p class="error-message" role="alert">{error}</p>
					{/if}

					<button type="button" class="action-btn" onclick={handleReceive} disabled={loading}>
						{#if loading}
							{$_('common.loading')}
						{:else}
							{$_('screen.transfer.receive_button')}
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.transfer-screen {
		max-width: 420px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.title {
		font-size: 1.3rem;
		color: #f7931a;
		text-align: center;
		margin-bottom: 1rem;
	}

	.tabs {
		display: flex;
		gap: 0;
		margin-bottom: 1.25rem;
		border: 1px solid #e0e0e0;
		border-radius: 10px;
		overflow: hidden;
	}

	.tab {
		flex: 1;
		padding: 0.65rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #888;
		background: #f8f8f8;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab.active {
		color: white;
		background: #f7931a;
	}

	.tab-content {
		/* tab content container */
		display: block;
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

	.text-area {
		padding: 0.7rem 0.85rem;
		font-size: 0.85rem;
		border: 2px solid #e0e0e0;
		border-radius: 10px;
		outline: none;
		resize: vertical;
		font-family: monospace;
		transition: border-color 0.2s;
	}

	.text-area:focus {
		border-color: #f7931a;
	}

	.text-area:disabled {
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

	.action-btn {
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 700;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 12px;
		cursor: pointer;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.result-card {
		text-align: center;
		padding: 1.5rem 1rem;
		background: #fff8f0;
		border: 1px solid #f7931a40;
		border-radius: 16px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.result-card.success {
		background: #d4edda;
		border-color: #c3e6cb;
	}

	.send-success-text {
		font-size: 1rem;
		font-weight: 700;
		color: #333;
	}

	.result-detail {
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

	.token-display {
		background: #f0f0f0;
		padding: 0.6rem;
		border-radius: 8px;
		word-break: break-all;
	}

	.token-text {
		font-size: 0.75rem;
		color: #555;
	}

	.copy-btn {
		padding: 0.6rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 10px;
		cursor: pointer;
	}

	.reset-btn {
		background: none;
		border: 1px solid #ccc;
		color: #666;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
	}
</style>
