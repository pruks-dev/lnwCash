<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getBalance, getMintBalances, type Balance, type MintBalance } from '$lib/wallet/balance';
	import { isOnline, onConnectivityChange } from '$lib/wallet/offline';

	interface Props {
		onNavigate?: (screen: string) => void;
	}

	let { onNavigate }: Props = $props();

	let totalBalance: number = $state(0);
	let mintBalances: MintBalance[] = $state([]);
	let loading: boolean = $state(false);
	let error: string = $state('');
	let online: boolean = $state(isOnline());

	$effect(() => {
		const cleanup = onConnectivityChange((status: boolean) => {
			online = status;
		});
		loadBalance();
		return cleanup;
	});

	async function loadBalance() {
		loading = true;
		error = '';
		try {
			const balance = await getBalance();
			totalBalance = balance.total;
			const breakdown = await getMintBalances();
			mintBalances = breakdown;
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}
</script>

<div class="balance-screen">
	<h2 class="title">{$_('screen.balance.title')}</h2>

	<div class="status-badge" class:online class:offline={!online}>
		{online ? $_('screen.balance.online') : $_('screen.balance.offline')}
	</div>

	<div class="total-card">
		<span class="total-label">{$_('screen.balance.total')}</span>
		{#if loading && totalBalance === 0}
			<span class="total-amount loading-text">{$_('common.loading')}</span>
		{:else if totalBalance === 0 && !loading}
			<span class="total-amount empty-text">{$_('screen.balance.empty')}</span>
		{:else}
			<span class="total-amount">{formatSat(totalBalance)}</span>
		{/if}
		<span class="total-unit">{$_('screen.balance.sats')}</span>
	</div>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}

	<button type="button" class="refresh-btn" onclick={loadBalance} disabled={loading}>
		{$_('screen.balance.refresh')}
	</button>

	{#if mintBalances.length > 0}
		<div class="breakdown">
			<h3 class="breakdown-title">{$_('screen.balance.mint_breakdown')}</h3>
			<ul class="mint-list">
				{#each mintBalances as mint}
					<li class="mint-item">
						<div class="mint-name" title={mint.mintUrl}>
							{mint.mintUrl}
						</div>
						<div class="mint-amount">{formatSat(mint.amount)} {$_('screen.balance.sats')}</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.balance-screen {
		max-width: 420px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.title {
		font-size: 1.3rem;
		color: #f7931a;
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.status-badge {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		margin: 0 auto 1rem;
		width: fit-content;
	}

	.status-badge.online {
		background: #d4edda;
		color: #155724;
	}

	.status-badge.offline {
		background: #fff3cd;
		color: #856404;
	}

	.total-card {
		text-align: center;
		padding: 2rem 1rem;
		background: linear-gradient(135deg, #f7931a20 0%, #f7931a05 100%);
		border-radius: 16px;
		border: 1px solid #f7931a30;
		margin-bottom: 1rem;
	}

	.total-label {
		display: block;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin-bottom: 0.5rem;
	}

	.total-amount {
		font-size: 2.5rem;
		font-weight: 800;
		color: #f7931a;
		line-height: 1.2;
	}

	.total-amount.loading-text {
		font-size: 1.25rem;
		color: #aaa;
	}

	.total-amount.empty-text {
		font-size: 1.25rem;
		color: #aaa;
	}

	.total-unit {
		display: block;
		font-size: 0.85rem;
		color: #999;
		margin-top: 0.25rem;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		text-align: center;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.refresh-btn {
		display: block;
		margin: 0 auto 1.5rem;
		padding: 0.6rem 1.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #f7931a;
		background: white;
		border: 2px solid #f7931a;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.refresh-btn:hover:not(:disabled) {
		background: #f7931a10;
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.breakdown {
		border-top: 1px solid #eee;
		padding-top: 1rem;
	}

	.breakdown-title {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin-bottom: 0.75rem;
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
		background: #f9f9f9;
		border-radius: 10px;
		border: 1px solid #eee;
	}

	.mint-name {
		font-size: 0.8rem;
		color: #555;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60%;
	}

	.mint-amount {
		font-size: 0.9rem;
		font-weight: 700;
		color: #f7931a;
	}
</style>
