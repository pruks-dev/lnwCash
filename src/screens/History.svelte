<script lang="ts">
	/**
	 * History Screen — TASK-060 (C) / D-015
	 * Full tx list with date grouping, pull-to-refresh, skeleton cards, empty state.
	 * Uses TASK-050: Card, Chip, Heading, Body, Divider, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { getTransactions } from '$lib/storage/db';
	import type { Transaction, TransactionType, TransactionStatus, TransactionFilter, TransactionProtocol } from '$lib/types';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Divider from '$lib/components/ui/Divider.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// TASK-050 Icons
	import HistoryIcon from '$lib/components/icons/History.svelte';

	// TASK-138 Iconly transaction icons
	import SendIcon from '$lib/components/icons/Send.svelte';
	import ReceiveIcon from '$lib/components/icons/Receive.svelte';
	import SwapIcon from '$lib/components/icons/Swap.svelte';
	import PlusIcon from '$lib/components/icons/Plus.svelte';
	import MinusIcon from '$lib/components/icons/Minus.svelte';
	import WalletIcon from '$lib/components/icons/Wallet.svelte';

	interface Props {
		maxItems?: number;
	}

	let { maxItems }: Props = $props();

	// TASK-138: Filter key → TransactionType[] mapping
	const FILTER_TYPE_MAP: Record<string, TransactionType[]> = {
		receive: ['mint', 'cashu_receive'],
		send: ['melt', 'cashu_send'],
		transfer: ['transfer'],
		cashu_send: ['cashu_send'],
		cashu_receive: ['cashu_receive'],
	};

	// ─── State ─────────────────────────────────────────────
	let transactions: Transaction[] = $state([]);
	let loading: boolean = $state(true);
	let error: string = $state('');
	let activeFilter: string = $state('all');

	// Pull-to-refresh state
	let pullDistance: number = $state(0);
	let isPulling: boolean = $state(false);
	let refreshing: boolean = $state(false);
	let touchStartY: number = $state(0);

	// ─── Load transactions on mount & filter change ───────
	$effect(() => {
		loadTransactions();
	});

	async function loadTransactions() {
		loading = true;
		error = '';
		try {
			const filter: TransactionFilter = {};
			if (activeFilter !== 'all') {
				const types = FILTER_TYPE_MAP[activeFilter];
				if (types) {
					filter.type = types.length === 1 ? types[0] : types;
				}
			}
			const txs = await getTransactions(filter);
			transactions = maxItems ? txs.slice(0, maxItems) : txs;
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	// ─── Formatting helpers ──────────────────────────────
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
			case 'mint': return $_('screen.history.type_receive');
			case 'melt': return $_('screen.history.type_send');
			case 'transfer': return $_('screen.history.type_transfer');
			case 'cashu_send': return $_('screen.history.type_send');
			case 'cashu_receive': return $_('screen.history.type_receive');
			default: return type;
		}
	}

	function protocolLabel(protocol?: TransactionProtocol): string {
		switch (protocol) {
			case 'lightning': return $_('screen.history.protocol_lightning');
			case 'cashu': return $_('screen.history.protocol_cashu');
			default: return '';
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

	// TASK-138: Iconly SVG component mapping (no unicode/emoji)
	const txIconMap: Record<TransactionType, typeof SendIcon> = {
		mint: PlusIcon,
		melt: MinusIcon,
		transfer: SwapIcon,
		cashu_send: SendIcon,
		cashu_receive: ReceiveIcon,
	};

	function getTxIcon(type: TransactionType): typeof SendIcon {
		return txIconMap[type] ?? WalletIcon;
	}

	function typeIconColor(type: TransactionType): string {
		switch (type) {
			case 'mint': return 'var(--color-success)';
			case 'melt': return 'var(--color-primary)';
			case 'transfer': return 'var(--color-secondary)';
			case 'cashu_send': return 'var(--color-primary)';
			case 'cashu_receive': return 'var(--color-success)';
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

	function setFilter(filter: string) {
		activeFilter = filter;
		loadTransactions();
	}

	// ─── Date grouping (TASK-060: "Today", "Yesterday", or date) ──
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
				// Show actual date for older entries
				key = txDate.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
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

	// ─── Pull-to-refresh ────────────────────────────────
	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchMove(e: TouchEvent) {
		const dy = e.touches[0].clientY - touchStartY;
		if (dy > 0 && pullDistance < 120) {
			pullDistance = Math.min(dy, 120);
			isPulling = true;
		}
	}

	async function handleTouchEnd() {
		if (pullDistance >= 60) {
			refreshing = true;
			await loadTransactions();
			refreshing = false;
		}
		pullDistance = 0;
		isPulling = false;
	}

	/**
	 * Empty state hint text — no i18n key modification (per TASK-060 rules).
	 * Fallback: Thai text when lang is 'th', English otherwise.
	 */
	function emptyStateHint(): string {
		if (typeof document !== 'undefined') {
			return document.documentElement.lang?.startsWith('th')
				? 'ทำธุรกรรมแรกของคุณวันนี้'
				: 'Make your first transaction today';
		}
		return '';
	}
</script>

<div
	class="history-screen"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	role="main"
	aria-label={$_('screen.history.title')}
>

	<!-- ─── Pull indicator ─────────────────────────────── -->
	{#if isPulling}
		<div class="pull-indicator" style="height: {pullDistance}px" aria-hidden="true">
			<Body size="sm" color="secondary">
				{#if refreshing}
					{$_('common.loading')}
				{:else}
					{pullDistance >= 60 ? $_('common.loading') : $_('screen.home.refresh')}
				{/if}
			</Body>
		</div>
	{/if}

	<Heading level="h2" align="center">{$_('screen.history.title')}</Heading>

	<!-- ─── Filter Chips ───────────────────────────────── -->
	<div class="filters">
		<Chip variant={activeFilter === 'all' ? 'active' : 'default'} onclick={() => setFilter('all')}>
			{$_('screen.history.filter_all')}
		</Chip>
		<Chip variant={activeFilter === 'receive' ? 'active' : 'default'} onclick={() => setFilter('receive')}>
			{$_('screen.history.filter_receive')}
		</Chip>
		<Chip variant={activeFilter === 'send' ? 'active' : 'default'} onclick={() => setFilter('send')}>
			{$_('screen.history.filter_send')}
		</Chip>
		<Chip variant={activeFilter === 'transfer' ? 'active' : 'default'} onclick={() => setFilter('transfer')}>
			{$_('screen.history.filter_transfer')}
		</Chip>
		<Chip variant={activeFilter === 'cashu_send' ? 'active' : 'default'} onclick={() => setFilter('cashu_send')}>
			{$_('screen.history.filter_cashu_send')}
		</Chip>
		<Chip variant={activeFilter === 'cashu_receive' ? 'active' : 'default'} onclick={() => setFilter('cashu_receive')}>
			{$_('screen.history.filter_cashu_receive')}
		</Chip>
	</div>

	<Divider />

	<!-- ─── Transactions / States ──────────────────────── -->
	{#if loading && !refreshing}
		<!-- Skeleton cards (TASK-060 loading state) -->
		<div class="skeleton-list" aria-busy="true" aria-label={$_('common.loading')}>
			{#each Array(3) as _}
				<div class="skeleton-card">
					<div class="skeleton-icon pulse"></div>
					<div class="skeleton-info">
						<div class="skeleton-line pulse skeleton-line-lg"></div>
						<div class="skeleton-line pulse skeleton-line-sm"></div>
					</div>
					<div class="skeleton-badge pulse"></div>
				</div>
			{/each}
		</div>
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
		<!-- Empty state (TASK-060: "ยังไม่มีธุรกรรม") -->
		<Card variant="basic" padding="lg">
			<div class="empty-state">
				<span class="empty-icon" aria-hidden="true">
					<HistoryIcon size={48} />
				</span>
				<Body size="md" color="disabled" align="center">{$_('screen.history.empty')}</Body>
				<Body size="sm" color="disabled" align="center">
					{emptyStateHint()}
				</Body>
			</div>
		</Card>
	{:else}
		<!-- Transaction groups by date -->
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
										<!-- svelte-ignore svelte_component_deprecated -->
										<svelte:component this={getTxIcon(tx.type)} size={20} color="white" />
									</span>
									<div class="tx-info">
										<div class="tx-header">
											<div class="tx-header-left">
												<Body size="sm" weight="semibold">{typeLabel(tx.type)}</Body>
												{#if tx.protocol}
													<span class="tx-protocol-badge" title={protocolLabel(tx.protocol)}>
														{protocolLabel(tx.protocol)}
													</span>
												{/if}
											</div>
											<Body size="sm" weight="semibold">
												{tx.type === 'mint' || tx.type === 'cashu_receive' ? '+' : '-'}{formatSat(tx.amount)} {$_('screen.balance.sats')}
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

	/* Pull indicator */
	.pull-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		transition: height 0.15s ease;
	}

	/* Filters */
	.filters {
		display: flex;
		gap: var(--space-xs);
		overflow-x: auto;
		padding-bottom: var(--space-xs);
		flex-wrap: wrap;
	}

	/* ─── Skeleton Cards (TASK-060 loading state) ─────── */
	.skeleton-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.skeleton-card {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.skeleton-icon {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		flex-shrink: 0;
	}

	.skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.skeleton-line {
		height: 14px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-variant);
	}

	.skeleton-line-lg {
		width: 60%;
	}

	.skeleton-line-sm {
		width: 40%;
	}

	.skeleton-badge {
		width: 60px;
		height: 20px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-variant);
		flex-shrink: 0;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 0.8; }
	}

	.pulse {
		animation: pulse 1.5s ease-in-out infinite;
	}

	/* ─── Empty State ──────────────────────────────────── */
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

	/* ─── Error ────────────────────────────────────────── */
	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	/* ─── Transaction Groups ──────────────────────────── */
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

	/* ─── Transaction Item ──────────────────────────────── */
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

	.tx-header-left {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.tx-protocol-badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		background: var(--color-surface-variant);
		padding: 0 4px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
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
