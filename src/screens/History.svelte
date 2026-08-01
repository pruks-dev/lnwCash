<script lang="ts">
	/**
	 * History Screen — full tx list with date grouping
	 * Uses TASK-050: Card, Chip, Heading, Body, Divider, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { getTransactions } from '$lib/storage/db';
	import type { Transaction, TransactionType, TransactionStatus, TransactionFilter } from '$lib/types';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Divider from '$lib/components/ui/Divider.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// TASK-050 Icons
	import HistoryIcon from '$lib/components/icons/History.svelte';

	interface Props {
		maxItems?: number;
	}

	let { maxItems }: Props = $props();

	let transactions: Transaction[] = $state([]);
	let loading: boolean = $state(true);
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
			transactions = maxItems ? txs.slice(0, maxItems) : txs;
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
			case 'mint': return $_('screen.history.type_mint');
			case 'melt': return $_('screen.history.type_melt');
			case 'transfer': return $_('screen.history.type_transfer');
			default: return type;
		}
	}

	function statusLabel(status: TransactionStatus): string {
		switch (status) {
			case 'pending': return $_('screen.history.status_pending');
			case 'confirmed': return $_('screen.history.status_confirmed');
			case 'failed': return $_('screen.history.status_failed');
			default: return status;
		}
	}

	function typeIcon(type: TransactionType): string {
		switch (type) {
			case 'mint': return '↓';
			case 'melt': return '↑';
			case 'transfer': return '⇄';
			default: return '?';
		}
	}

	function typeIconColor(type: TransactionType): string {
		switch (type) {
			case 'mint': return 'var(--color-success)';
			case 'melt': return 'var(--color-primary)';
			case 'transfer': return 'var(--color-secondary)';
			default: return 'var(--color-text-secondary)';
		}
	}

	function statusColor(status: TransactionStatus): string {
		switch (status) {
			case 'confirmed': return 'var(--color-success)';
			case 'pending': return 'var(--color-warning)';
			case 'failed': return 'var(--color-error)';
			default: return 'var(--color-text-secondary)';
		}
	}

	function setFilter(filter: TransactionType | 'all') {
		activeFilter = filter;
		loadTransactions();
	}

	// Group transactions by date
	function groupByDate(txs: Transaction[]): Record<string, Transaction[]> {
		const groups: Record<string, Transaction[]> = {};
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const yesterday = today - 86400000;
		const weekAgo = today - 7 * 86400000;

		for (const tx of txs) {
			const txDate = new Date(tx.timestamp);
			const txDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate()).getTime();

			let key: string;
			if (txDay >= today) {
				key = $_('screen.history.today');
			} else if (txDay >= yesterday) {
				key = $_('screen.history.yesterday');
			} else if (txDay >= weekAgo) {
				key = $_('screen.history.this_week');
			} else {
				key = $_('screen.history.older');
			}

			if (!groups[key]) groups[key] = [];
			groups[key].push(tx);
		}
		return groups;
	}

	let groupedTxs = $derived.by(() => {
		const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
		return groupByDate(sorted);
	});

	let groupKeys = $derived.by(() => Object.keys(groupedTxs));
</script>

<div class="history-screen" role="main" aria-label={$_('screen.history.title')}>

	<Heading level="h2" align="center">{$_('screen.history.title')}</Heading>

	<!-- ─── Filter Chips ─────────────────────────────── -->
	<div class="filters">
		<Chip variant={activeFilter === 'all' ? 'active' : 'default'} onclick={() => setFilter('all')}>
			{$_('screen.history.filter_all')}
		</Chip>
		<Chip variant={activeFilter === 'mint' ? 'active' : 'default'} onclick={() => setFilter('mint')}>
			{$_('screen.history.filter_mint')}
		</Chip>
		<Chip variant={activeFilter === 'melt' ? 'active' : 'default'} onclick={() => setFilter('melt')}>
			{$_('screen.history.filter_melt')}
		</Chip>
		<Chip variant={activeFilter === 'transfer' ? 'active' : 'default'} onclick={() => setFilter('transfer')}>
			{$_('screen.history.filter_transfer')}
		</Chip>
	</div>

	<Divider />

	<!-- ─── Transactions ─────────────────────────────── -->
	{#if loading}
		<Card variant="basic" padding="lg">
			<Body size="md" color="disabled" align="center">{$_('common.loading')}</Body>
		</Card>
	{:else if error}
		<Card variant="basic" padding="md">
			<div class="error-card">
				<Body size="sm" color="text">{error}</Body>
				<Button variant="secondary" size="sm" onclick={loadTransactions}>
					{#snippet children()}{$_('common.retry')}{/snippet}
				</Button>
			</div>
		</Card>
	{:else if transactions.length === 0}
		<Card variant="basic" padding="lg">
			<div class="empty-state">
				<span class="empty-icon" aria-hidden="true">
					<HistoryIcon size={48} />
				</span>
				<Body size="md" color="disabled" align="center">{$_('screen.history.empty')}</Body>
			</div>
		</Card>
	{:else}
		<div class="tx-grouped-list">
			{#each groupKeys as groupKey (groupKey)}
				<div class="tx-group">
					<Heading level="h4">{groupKey}</Heading>
					<div class="tx-items">
						{#each groupedTxs[groupKey] as tx (tx.id)}
							<Card variant="basic" padding="md">
								<div class="tx-item">
									<span
										class="tx-type-icon"
										style="background: {typeIconColor(tx.type)}"
										aria-hidden="true"
									>
										{typeIcon(tx.type)}
									</span>
									<div class="tx-info">
										<div class="tx-header">
											<Body size="sm" weight="semibold">{typeLabel(tx.type)}</Body>
											<Body size="sm" weight="semibold" color={tx.type === 'mint' ? 'text' : 'text'}>
												{tx.type === 'mint' ? '+' : '-'}{formatSat(tx.amount)} {$_('screen.balance.sats')}
											</Body>
										</div>
										<div class="tx-meta">
											<Body size="sm" color="secondary">{formatDate(tx.timestamp)}</Body>
											<span
												class="tx-status-badge"
												style="background: {statusColor(tx.status)}"
											>
												{statusLabel(tx.status)}
											</span>
										</div>
									</div>
								</div>
							</Card>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="bottom-spacer"></div>
</div>

<style>
	.history-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.filters {
		display: flex;
		gap: var(--space-xs);
		overflow-x: auto;
		padding-bottom: var(--space-xs);
		flex-wrap: wrap;
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-xl) 0;
	}

	.empty-icon {
		color: var(--color-text-disabled);
	}

	/* Error */
	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	/* Transaction Groups */
	.tx-grouped-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.tx-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.tx-items {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	/* Transaction Item */
	.tx-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.tx-type-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		color: white;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		flex-shrink: 0;
	}

	.tx-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tx-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-status-badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: white;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
