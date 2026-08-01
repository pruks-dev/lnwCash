<script lang="ts">
	/**
	 * Home Dashboard — D-004
	 * Balance card + Quick Actions + Recent Transactions
	 * Uses TASK-050: Card, Button, Heading, Body, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { getBalance, getMintBalances, type Balance, type MintBalance } from '$lib/wallet/balance';
	import { getTransactions } from '$lib/storage/db';
	import type { Transaction, TransactionType, TransactionStatus } from '$lib/types';
	import { isOnline, onConnectivityChange } from '$lib/wallet/offline';
	import { navigateTo } from '$lib/router';
	import type { ScreenKey } from '$lib/router';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Divider from '$lib/components/ui/Divider.svelte';

	// TASK-050 Icons
	import Wallet from '$lib/components/icons/Wallet.svelte';
	import Receive from '$lib/components/icons/Receive.svelte';
	import Send from '$lib/components/icons/Send.svelte';
	import Scan from '$lib/components/icons/Scan.svelte';
	import History from '$lib/components/icons/History.svelte';
	import ArrowRight from '$lib/components/icons/ArrowRight.svelte';

	interface Props {
		onQRScan?: () => void;
	}

	let { onQRScan }: Props = $props();

	let totalBalance: number = $state(0);
	let loading: boolean = $state(true);
	let error: string = $state('');
	let online: boolean = $state(isOnline());
	let recentTxs: Transaction[] = $state([]);
	let pullDistance: number = $state(0);
	let isPulling: boolean = $state(false);
	let refreshing: boolean = $state(false);
	let touchStartY: number = $state(0);

	$effect(() => {
		const cleanup = onConnectivityChange((status: boolean) => {
			online = status;
		});
		loadAll();
		return cleanup;
	});

	async function loadAll() {
		await Promise.all([loadBalance(), loadRecentTxs()]);
		loading = false;
	}

	async function loadBalance() {
		error = '';
		try {
			const balance = await getBalance();
			totalBalance = balance.total;
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		}
	}

	async function loadRecentTxs() {
		try {
			const txs = await getTransactions({});
			recentTxs = txs.slice(0, 5);
		} catch {
			// Non-critical — recent tx is secondary
		}
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	function estimateFiat(sats: number): string {
		// Rough estimate: 1 sat ≈ 0.015 THB
		const thb = Math.round(sats * 0.015);
		return thb.toLocaleString();
	}

	function navTo(screen: ScreenKey) {
		navigateTo(screen);
	}

	function handleScan() {
		onQRScan?.();
	}

	function txTypeLabel(type: TransactionType): string {
		switch (type) {
			case 'mint': return $_('screen.history.type_mint');
			case 'melt': return $_('screen.history.type_melt');
			case 'transfer': return $_('screen.history.type_transfer');
			default: return type;
		}
	}

	function txTypeIcon(type: TransactionType): string {
		switch (type) {
			case 'mint': return '↓';
			case 'melt': return '↑';
			case 'transfer': return '⇄';
			default: return '?';
		}
	}

	function formatTxDate(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function statusColor(status: TransactionStatus): string {
		switch (status) {
			case 'confirmed': return 'var(--color-success)';
			case 'pending': return 'var(--color-warning)';
			case 'failed': return 'var(--color-error)';
			default: return 'var(--color-text-secondary)';
		}
	}

	// Pull-to-refresh
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
			await loadAll();
			refreshing = false;
		}
		pullDistance = 0;
		isPulling = false;
	}
</script>

<div
	class="home-screen"
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	role="main"
	aria-label={$_('screen.home.title')}
>

	{#if isPulling}
		<div class="pull-indicator" style="height: {pullDistance}px" aria-hidden="true">
			{#if refreshing}
				<Body size="sm" color="secondary">{$_('common.loading')}</Body>
			{:else}
				<Body size="sm" color="secondary">
					{pullDistance >= 60 ? $_('common.loading') : $_('screen.home.refresh')}
				</Body>
			{/if}
		</div>
	{/if}

	<!-- ─── Balance Card ──────────────────────────────────── -->
	<Card variant="basic" padding="lg">
		<div class="balance-section">
			<Heading level="h2" align="center">{$_('screen.home.total_balance')}</Heading>
			{#if loading}
				<Body size="lg" weight="semibold" color="disabled" align="center">{$_('common.loading')}</Body>
			{:else if error}
				<Body size="lg" color="disabled" align="center">{error}</Body>
			{:else if totalBalance === 0}
				<Body size="lg" color="disabled" align="center">{$_('screen.balance.empty')}</Body>
			{:else}
				<div class="balance-amount">
					<span class="balance-value">{formatSat(totalBalance)}</span>
					<span class="balance-unit">{$_('screen.balance.sats')}</span>
				</div>
				<div class="fiat-estimate">
					{$_('screen.home.estimated_fiat'.replace('{amount}', estimateFiat(totalBalance)))}
				</div>
			{/if}
			<div class="balance-status">
				<Badge>
					{#if online}
						{$_('screen.balance.online')}
					{:else}
						{$_('screen.balance.offline')}
					{/if}
				</Badge>
			</div>
		</div>
	</Card>

	<!-- ─── Quick Actions ─────────────────────────────────── -->
	<div class="quick-actions">
		<Heading level="h3">{$_('screen.home.quick_actions')}</Heading>
		<div class="action-buttons">
			<button
				type="button"
				class="action-btn"
				onclick={() => navTo('receive')}
				aria-label={$_('wallet.receive')}
			>
				<span class="action-icon receive-icon">
					<Receive size={24} />
				</span>
				<Body size="sm" weight="medium">{$_('wallet.receive')}</Body>
			</button>

			<button
				type="button"
				class="action-btn"
				onclick={() => navTo('send')}
				aria-label={$_('wallet.send')}
			>
				<span class="action-icon send-icon">
					<Send size={24} />
				</span>
				<Body size="sm" weight="medium">{$_('wallet.send')}</Body>
			</button>

			<button
				type="button"
				class="action-btn"
				onclick={handleScan}
				aria-label={$_('screen.receive.scan_qr')}
			>
				<span class="action-icon scan-icon">
					<Scan size={24} />
				</span>
				<Body size="sm" weight="medium">{$_('screen.receive.scan_qr')}</Body>
			</button>
		</div>
	</div>

	<Divider />

	<!-- ─── Recent Transactions ───────────────────────────── -->
	<div class="recent-tx-section">
		<div class="section-header">
			<Heading level="h3">{$_('screen.home.recent_tx')}</Heading>
			<Button variant="ghost" size="sm" onclick={() => navTo('history')}>
				{#snippet children()}
					{$_('screen.home.view_all')}
					<ArrowRight size={14} />
				{/snippet}
			</Button>
		</div>

		{#if recentTxs.length === 0}
			<Card variant="basic" padding="md">
				<Body size="sm" color="secondary" align="center">{$_('screen.home.no_tx')}</Body>
			</Card>
		{:else}
			<div class="tx-list">
				{#each recentTxs as tx}
					<Card variant="interactive" padding="md" onclick={() => navTo('history')}>
						<div class="tx-item">
							<span class="tx-icon-bg" aria-hidden="true">{txTypeIcon(tx.type)}</span>
							<div class="tx-info">
								<Body size="sm" weight="semibold">{txTypeLabel(tx.type)}</Body>
								<Body size="sm" color="secondary">
									{tx.amount} {$_('screen.balance.sats')} · {formatTxDate(tx.timestamp)}
								</Body>
							</div>
							<div class="tx-status-dot" style="background: {statusColor(tx.status)}" title={tx.status}></div>
						</div>
					</Card>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Spacer for bottom nav -->
	<div class="bottom-spacer"></div>
</div>

<style>
	.home-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.pull-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		transition: height 0.15s ease;
	}

	/* Balance Card */
	.balance-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	.balance-amount {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.balance-value {
		font-family: var(--font-family);
		font-size: var(--font-size-3xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
	}

	.balance-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.fiat-estimate {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.balance-status {
		margin-top: var(--space-xs);
	}

	/* Quick Actions */
	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.action-buttons {
		display: flex;
		justify-content: space-around;
		gap: var(--space-md);
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-md);
		border: none;
		background: none;
		cursor: pointer;
		color: var(--color-text);
		font-family: var(--font-family);
		transition: all var(--transition-fast);
		border-radius: var(--radius-lg);
		min-width: 80px;
		min-height: 44px;
		-webkit-tap-highlight-color: transparent;
	}

	.action-btn:hover,
	.action-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.action-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.action-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		color: white;
	}

	.receive-icon { background: var(--color-success); }
	.send-icon { background: var(--color-primary); }
	.scan-icon { background: var(--color-secondary); }

	/* Recent Tx */
	.recent-tx-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tx-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.tx-item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.tx-icon-bg {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		font-size: var(--font-size-lg);
		flex-shrink: 0;
	}

	.tx-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tx-status-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
