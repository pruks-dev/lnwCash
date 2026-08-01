<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { createWallet, getWalletStatus, type WalletState } from '$lib/wallet/state';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';

	interface Props {
		pin: string;
		onCreated?: (state: WalletState) => void;
	}

	let { pin = '', onCreated }: Props = $props();

	let walletName: string = $state('');
	let mintUrls: string[] = $state([]);
	let newMintUrl: string = $state('');
	let loading: boolean = $state(false);
	let error: string = $state('');
	let mintInfoMap: Record<string, { name: string; keysets: string[] }> = $state({});

	function addMint() {
		const url = newMintUrl.trim();
		if (!url) return;
		if (!url.startsWith('https://') && !url.startsWith('http://')) {
			error = 'URL ต้องขึ้นต้นด้วย http:// หรือ https://';
			return;
		}
		if (mintUrls.includes(url)) {
			error = 'Mint นี้มีอยู่แล้ว';
			return;
		}
		mintUrls = [...mintUrls, url];
		newMintUrl = '';
		error = '';
		fetchMintInfo(url);
	}

	function removeMint(url: string) {
		mintUrls = mintUrls.filter((u) => u !== url);
		const newMap = { ...mintInfoMap };
		delete newMap[url];
		mintInfoMap = newMap;
	}

	async function fetchMintInfo(url: string) {
		try {
			const keysets = await fetchAndCacheKeysets(url);
			const active = keysets.filter((k: { active: boolean }) => k.active);
			mintInfoMap = {
				...mintInfoMap,
				[url]: {
					name: url,
					keysets: active.map((k: { id: string }) => k.id)
				}
			};
		} catch {
			mintInfoMap = {
				...mintInfoMap,
				[url]: { name: url, keysets: [] }
			};
		}
	}

	async function handleCreate() {
		error = '';
		if (!walletName.trim()) {
			error = $_('screen.wallet.error_name_required');
			return;
		}
		if (mintUrls.length < 2) {
			error = $_('screen.wallet.error_no_mint');
			return;
		}
		if (pin.length < 6) {
			error = $_('screen.register.error_too_short');
			return;
		}

		loading = true;
		try {
			const result = await createWallet(pin, walletName.trim());
			onCreated?.(getWalletStatus());
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}
</script>

<div class="create-wallet-screen">
	<h2 class="title">{$_('screen.wallet.create_title')}</h2>

	<div class="form">
		<label class="input-group">
			<span class="label-text">{$_('screen.wallet.name_label')}</span>
			<input
				type="text"
				bind:value={walletName}
				placeholder={$_('screen.wallet.name_placeholder')}
				disabled={loading}
				class="text-input"
			/>
		</label>

		<div class="mint-section">
			<span class="label-text">{$_('screen.wallet.mint_url_label')}</span>
			<div class="mint-input-row">
				<input
					type="url"
					bind:value={newMintUrl}
					placeholder="https://mint.example.com"
					disabled={loading}
					class="text-input mint-url-input"
					onkeydown={(e) => e.key === 'Enter' && addMint()}
				/>
				<button type="button" class="add-btn" onclick={addMint} disabled={loading || !newMintUrl.trim()}>
					{$_('screen.wallet.add_mint')}
				</button>
			</div>

			{#if mintUrls.length > 0}
				<ul class="mint-list">
					{#each mintUrls as url}
						<li class="mint-item">
							<div class="mint-info">
								<span class="mint-url">{url}</span>
								{#if mintInfoMap[url]?.keysets?.length}
									<span class="mint-keysets">
										{$_('screen.wallet.keyset_label')}: {mintInfoMap[url].keysets.length}
									</span>
								{/if}
							</div>
							<button
								type="button"
								class="remove-btn"
								onclick={() => removeMint(url)}
								disabled={loading}
							>
								{$_('screen.wallet.remove_mint')}
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">{$_('screen.wallet.error_no_mint')}</p>
			{/if}
		</div>

		{#if error}
			<p class="error-message" role="alert">{error}</p>
		{/if}

		<button
			type="button"
			class="create-btn"
			onclick={handleCreate}
			disabled={loading || mintUrls.length < 2 || !walletName.trim()}
		>
			{#if loading}
				{$_('common.loading')}
			{:else}
				{$_('screen.wallet.create_button')}
			{/if}
		</button>
	</div>
</div>

<style>
	.create-wallet-screen {
		max-width: 420px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.title {
		font-size: 1.5rem;
		color: #f7931a;
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
	}

	.text-input:focus {
		border-color: #f7931a;
	}

	.text-input:disabled {
		opacity: 0.6;
		background: #f5f5f5;
	}

	.mint-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mint-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.mint-url-input {
		flex: 1;
	}

	.add-btn {
		padding: 0.7rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		white-space: nowrap;
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.mint-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mint-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 0.75rem;
		background: #f8f8f8;
		border-radius: 8px;
		border: 1px solid #e8e8e8;
	}

	.mint-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		overflow: hidden;
	}

	.mint-url {
		font-size: 0.8rem;
		color: #333;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mint-keysets {
		font-size: 0.7rem;
		color: #888;
	}

	.remove-btn {
		background: none;
		border: 1px solid #e74c3c;
		color: #e74c3c;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.remove-btn:disabled {
		opacity: 0.4;
	}

	.hint {
		font-size: 0.8rem;
		color: #999;
		margin: 0;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		margin: 0;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
	}

	.create-btn {
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 700;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		margin-top: 0.5rem;
	}

	.create-btn:hover:not(:disabled) {
		background: #e6820f;
	}

	.create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
