<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getTransactions } from '$lib/storage/db';
	import type { Transaction, TransactionType, TransactionStatus, TransactionFilter } from '$lib/types';

	interface Props {
		maxItems?: number;
	}

	let { maxItems }: Props = $props();

	let transactions: Transaction[] = $state([]);
	let loading: boolean = $state(false);
	let error: string = $state('');
	let activeFilter: TransactionType | 'all' = $state('all');

	$effect(() => {
		loadTransactions();
	});

	async function loadTransactions() {
		loading = true;
		error = '';
		try {
			const filter: TransactionFilter = {};
			if (activeFilter !== 'all') {
				filter.type = activeFilter;
			}
			const txs = await getTransactions(filter);
			transactions = txs;
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function typeLabel(type: TransactionType): string {
		switch (type) {
			case 'mint':
				return $_('screen.history.type_mint');
			case 'melt':
				return $_('screen.history.type_melt');
			case 'transfer':
				return $_('screen.history.type_transfer');
			default:
				return type;
		}
	}

	function statusLabel(status: TransactionStatus): string {
		switch (status) {
			case 'pending':
				return $_('screen.history.status_pending');
			case 'confirmed':
				return $_('screen.history.status_confirmed');
			case 'failed':
				return $_('screen.history.status_failed');
			default:
				return status;
		}
	}

	function typeIcon(type: TransactionType): string {
		switch (type) {
			case 'mint':
				return '\u{2B07}'; // ⬇
			case 'melt':
				return '\u{2B06}'; // ⬆
			case 'transfer':
				return '\u{21C4}'; // ⇄
			default:
				return '\u{2753}'; // ❓
		}
	}

	function setFilter(filter: TransactionType | 'all') {
		activeFilter = filter;
		loadTransactions();
	}
</script>

<div class="history-screen">
	<h2 class="title">{$_('screen.history.title')}</h2>

	<div class="filters">
		<button
			type="button"
			class="filter-btn"
			class:active={activeFilter === 'all'}
			onclick={() => setFilter('all')}
		>
			{$_('screen.history.filter_all')}
		</button>
		<button
			type="button"
			class="filter-btn"
			class:active={activeFilter === 'mint'}
			onclick={() => setFilter('mint')}
		>
			{$_('screen.history.filter_mint')}
		</button>
		<button
			type="button"
			class="filter-btn"
			class:active={activeFilter === 'melt'}
			onclick={() => setFilter('melt')}
		>
			{$_('screen.history.filter_melt')}
		</button>
		<button
			type="button"
			class="filter-btn"
			class:active={activeFilter === 'transfer'}
			onclick={() => setFilter('transfer')}
		>
			{$_('screen.history.filter_transfer')}
		</button>
	</div>

	{#if loading}
		<p class="loading-text">{$_('common.loading')}</p>
	{:else if error}
		<p class="error-message" role="alert">{error}</p>
	{:else if transactions.length === 0}
		<div class="empty-state">
			<span class="empty-icon">&#128203;</span>
			<p>{$_('screen.history.empty')}</p>
		</div>
	{:else}
		<ul class="tx-list">
			{#each transactions as tx}
				<li class="tx-item">
					<div class="tx-icon">{typeIcon(tx.type)}</div>
					<div class="tx-info">
						<div class="tx-header">
							<span class="tx-type">{typeLabel(tx.type)}</span>
							<span class="tx-status status-{tx.status}">{statusLabel(tx.status)}</span>
						</div>
						<div class="tx-details">
							<span class="tx-amount">{formatSat(tx.amount)} {$_('screen.balance.sats')}</span>
							<span class="tx-date">{formatDate(tx.timestamp)}</span>
						</div>
						{#if tx.mint_url}
							<span class="tx-mint" title={tx.mint_url}>{tx.mint_url}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<button type="button" class="refresh-btn" onclick={loadTransactions} disabled={loading}>
		{$_('screen.balance.refresh')}
	</button>
</div>

<style>
	.history-screen {
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

	.filters {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 1rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.filter-btn {
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #888;
		background: #f0f0f0;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s;
	}

	.filter-btn.active {
		color: white;
		background: #f7931a;
	}

	.loading-text {
		text-align: center;
		color: #aaa;
		padding: 2rem;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		text-align: center;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: #aaa;
	}

	.empty-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	.tx-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tx-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #f9f9f9;
		border-radius: 12px;
		border: 1px solid #eee;
		align-items: center;
	}

	.tx-icon {
		font-size: 1.25rem;
		width: 2.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f0f0f0;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tx-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.tx-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-type {
		font-size: 0.85rem;
		font-weight: 600;
		color: #333;
	}

	.tx-status {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
	}

	.status-pending {
		background: #fff3cd;
		color: #856404;
	}

	.status-confirmed {
		background: #d4edda;
		color: #155724;
	}

	.status-failed {
		background: #fdeaea;
		color: #c0392b;
	}

	.tx-details {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-amount {
		font-size: 0.95rem;
		font-weight: 700;
		color: #f7931a;
	}

	.tx-date {
		font-size: 0.7rem;
		color: #aaa;
	}

	.tx-mint {
		font-size: 0.65rem;
		color: #bbb;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.refresh-btn {
		display: block;
		margin: 0 auto;
		padding: 0.6rem 1.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #f7931a;
		background: white;
		border: 2px solid #f7931a;
		border-radius: 10px;
		cursor: pointer;
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
