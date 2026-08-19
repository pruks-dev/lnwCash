<script lang="ts">
	/**
	 * History Screen — TASK-060 (C) / D-015
	 * Full tx list with date grouping, pull-to-refresh, skeleton cards, empty state.
	 * Uses TASK-050: Card, Chip, Heading, Body, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { getTransactions } from '$lib/storage/db';
	import type { Transaction, TransactionType, TransactionStatus, TransactionFilter, TransactionProtocol } from '$lib/types';
	import { computeFeeReturn } from '$lib/wallet/feeReturn';
	import { getSettings } from '$lib/storage/local';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	
	import Button from '$lib/components/ui/Button.svelte';

	// TASK-142 Iconly unified component
	import Iconly from '$lib/iconly/Iconly.svelte';

	// TASK-150 Transaction Detail Bottom Sheet
	import TransactionDetailSheet from '$lib/components/TransactionDetailSheet.svelte';

	interface Props {
		maxItems?: number;
	}

	let { maxItems }: Props = $props();

	// TASK-142: Filter key → TransactionType[] mapping (3 chips)
	const FILTER_TYPE_MAP: Record<string, TransactionType[]> = {
		receive: ['mint', 'cashu_receive'],
		send: ['melt', 'transfer', 'cashu_send'],
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

	// TASK-150: Transaction detail sheet state
	let selectedTx: Transaction | null = $state(null);

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

	// TASK-142: 2-category mapping (send/receive) — unified <Iconly>
	function getTxCategory(type: TransactionType): 'Send' | 'Receive' {
		switch (type) {
			case 'mint':
			case 'cashu_receive':
				return 'Receive';
			case 'melt':
			case 'transfer':
			case 'cashu_send':
				return 'Send';
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

	// TASK-150: Open detail sheet for a transaction
	function openDetail(tx: Transaction) {
		selectedTx = tx;
	}

	function closeDetail() {
		selectedTx = null;
	}

	// TASK-315: fee return badge gate + computed value per tx.
	// Setting is read once on render; toggle persists in localStorage and is
	// read again on the next render after the user re-enters the History screen.
	let showFeeReturnSetting = $derived(getSettings().show_fee_return ?? false);
	function txFeeReturn(tx: Transaction): number {
		return computeFeeReturn(tx);
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
		<Chip variant={activeFilter === 'send' ? 'active' : 'default'} onclick={() => setFilter('send')}>
			<Iconly name="Send" size={14} /> {$_('screen.history.filter_send')}
		</Chip>
		<Chip variant={activeFilter === 'receive' ? 'active' : 'default'} onclick={() => setFilter('receive')}>
			<Iconly name="Receive" size={14} /> {$_('screen.history.filter_receive')}
		</Chip>
	</div>

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
					<Iconly name="History" size={48} />
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
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="tx-clickable"
								onclick={() => openDetail(tx)}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tx); } }}
								role="button"
								tabindex="0"
								aria-label="{typeLabel(tx.type)} — {getTxCategory(tx.type) === 'Receive' ? '+' : '-'}{formatSat(tx.amount)} {$_('screen.balance.sats')}"
							>
							<Card variant="basic" padding="md">
								<div class="tx-item">
									<span
										class="tx-type-icon"
										class:tx-receive={getTxCategory(tx.type) === 'Receive'}
										class:tx-send={getTxCategory(tx.type) === 'Send'}
										aria-hidden="true"
									>
										<Iconly name={getTxCategory(tx.type)} size={20} />
									</span>
									<div class="tx-info">
										<div class="tx-header">
											<div class="tx-header-left">
												<Body size="sm" weight="semibold">{typeLabel(tx.type)}</Body>
												{#if tx.protocol}
													<span
														class="tx-protocol-badge"
														class:protocol-cashu={tx.protocol === 'cashu'}
														class:protocol-lightning={tx.protocol === 'lightning'}
														title={protocolLabel(tx.protocol)}
													>
														{protocolLabel(tx.protocol)}
													</span>
												{/if}
												<!-- TASK-315: NUT-08 fee return badge inline (default OFF) -->
												{#if showFeeReturnSetting && tx.type === 'melt' && txFeeReturn(tx) > 0}
													<span class="tx-fee-return-badge">{$_('history.fee_return', { values: { amount: txFeeReturn(tx) } })}</span>
												{/if}
											</div>
											<Body size="sm" weight="semibold">
												{getTxCategory(tx.type) === 'Receive' ? '+' : '-'}{formatSat(tx.amount)} {$_('screen.balance.sats')}
											</Body>
										</div>
										<div class="tx-meta">
											<Body size="sm" color="secondary">{formatDate(tx.timestamp)}</Body>
											{#if tx.status === 'pending'}
												<span class="tx-pending-indicator" aria-label={$_('screen.history.pending_text')}>
													<Iconly name="Time" size={14} />
													<span class="pending-text">{$_('screen.history.pending_text')}</span>
												</span>
											{:else}
												<span
													class="tx-status-badge"
													class:status-confirmed={tx.status === 'confirmed'}
													class:status-failed={tx.status === 'failed'}
												>
													{statusLabel(tx.status)}
												</span>
											{/if}
										</div>
									</div>
								</div>
							</Card>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="bottom-spacer"></div>

	<!-- TASK-150: Transaction Detail Bottom Sheet -->
	<TransactionDetailSheet tx={selectedTx} onclose={closeDetail} />
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
	.tx-clickable {
		cursor: pointer;
		border-radius: var(--radius-lg);
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.tx-clickable:hover {
		opacity: 0.85;
	}

	.tx-clickable:active {
		transform: scale(0.98);
	}

	.tx-clickable:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

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

	/* Dark theme (default) */
	/* TX icon — Send (Cyan / LnwCash brand) — soft BG both themes */
	.tx-type-icon.tx-send {
		background: rgba(0, 188, 212, 0.22);
		color: var(--color-primary);
	}
	/* TX icon — Receive (Teal / cool positive) */
	.tx-type-icon.tx-receive {
		background: rgba(20, 184, 166, 0.22);
		color: var(--color-secondary);
	}

	:global([data-theme='dark']) .tx-type-icon.tx-send {
		background: rgba(38, 198, 218, 0.28);
		color: var(--color-primary-light);
	}

	/* Protocol — Lightning (soft BG, accessible both themes) */
	.tx-protocol-badge.protocol-lightning {
		background: rgba(0, 188, 212, 0.25);
		color: var(--color-primary);
	}
	/* Protocol — Cashu (soft BG, accessible both themes) */
	.tx-protocol-badge.protocol-cashu {
		background: rgba(124, 58, 237, 0.22);
		color: var(--color-protocol-lightning);
	}

	/* Light theme overrides — removed tx-send override (default rule handles light now) */

	/* Dark theme variant — :global() escapes Svelte scoped-CSS analyzer
	   (which otherwise tree-shakes [data-theme='dark'] as 'unused' because
	   data-theme is set on documentElement, not detectable statically). */
	:global([data-theme='dark']) .tx-protocol-badge.protocol-lightning {
		background: rgba(38, 198, 218, 0.18);
		color: var(--color-primary-light);
	}
	:global([data-theme='dark']) .tx-protocol-badge.protocol-cashu {
		background: rgba(183, 148, 244, 0.18);
		color: var(--color-protocol-lightning);
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
		color: var(--color-white);
		padding: 1px 6px;
		letter-spacing: 0.02em;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	/* TASK-315: NUT-08 fee return badge — inline next to protocol badge */
	.tx-fee-return-badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		padding: 1px 6px;
		letter-spacing: 0.02em;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		background: rgba(20, 184, 166, 0.22);
		color: var(--color-secondary);
	}
	@media (prefers-color-scheme: light) {
		.tx-fee-return-badge {
			background: rgba(20, 184, 166, 0.14);
			color: #0f766e;
		}
	}

	.tx-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-status-badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: #fff;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}
	.tx-status-badge.status-confirmed {
		background: rgba(20, 184, 166, 0.22);
		color: var(--color-secondary);
	}
	.tx-status-badge.status-failed {
		background: var(--color-error);
	}

	/* TASK-149 (CV17-001): Pending indicator — Time icon + text */
	.tx-pending-indicator {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--color-accent);
		animation: pending-pulse 2s ease-in-out infinite;
	}

	@keyframes pending-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.pending-text {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--color-accent);
		white-space: nowrap;
	}

	/* Light theme — muted backgrounds */
	@media (prefers-color-scheme: light) {
		.tx-status-badge.status-failed {
			background: rgba(239, 68, 68, 0.12);
			color: var(--color-error);
		}
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
