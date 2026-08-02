<script lang="ts">
	/**
	 * Home Dashboard — Wallet Page Redesign (TASK-059)
	 * Home-centric: Balance display + Send/Receive + Recent transactions
	 * Design token: LNWCASH Cyan = #00bcd4
	 *
	 * Svelte 5 runes: $state, $derived, $effect
	 */
	import { _ } from 'svelte-i18n';
	import { getBalance } from '$lib/wallet/balance';
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
	import Divider from '$lib/components/ui/Divider.svelte';

	// TASK-050 Icons
	import Receive from '$lib/components/icons/Receive.svelte';
	import Send from '$lib/components/icons/Send.svelte';
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
	let refreshing: boolean = $state(false);

	$effect(() => {
		const cleanup = onConnectivityChange((status: boolean) => {
			online = status;
		});
		loadAll();
		return cleanup;
	});

	async function loadAll() {
		try {
			await Promise.all([loadBalance(), loadRecentTxs()]);
		} finally {
			loading = false;
		}
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
			// Non-critical
		}
	}

	async function handleRefresh() {
		refreshing = true;
		await loadAll();
		refreshing = false;
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	function estimateFiat(sats: number): string {
		const thb = Math.round(sats * 0.015);
		return thb.toLocaleString();
	}

	function navTo(screen: ScreenKey) {
		navigateTo(screen);
	}

	function txTypeLabel(type: TransactionType): string {
		switch (type) {
			case 'mint': return $_('screen.history.type_receive');
			case 'melt': return $_('screen.history.type_send');
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

	function handleRipple(e: MouseEvent) {
		const btn = e.currentTarget as HTMLElement;
		const rect = btn.getBoundingClientRect();
		const size = Math.max(rect.width, rect.height);
		const x = e.clientX - rect.left - size / 2;
		const y = e.clientY - rect.top - size / 2;

		const ripple = document.createElement('span');
		ripple.className = 'ripple-effect';
		ripple.style.width = `${size}px`;
		ripple.style.height = `${size}px`;
		ripple.style.left = `${x}px`;
		ripple.style.top = `${y}px`;

		btn.appendChild(ripple);
		ripple.addEventListener('animationend', () => {
			ripple.remove();
		});
	}
</script>

<div class="home-scroll" role="main" aria-label={$_('screen.home.title')}>
	<div class="home-content">

		<!-- A — Balance Display -->
		<div class="balance-container">
			<div class="balance-section">
				<Heading level="h2" align="center">{$_('screen.home.total_balance')}</Heading>

				{#if loading}
					<Body size="lg" weight="semibold" color="disabled" align="center">
						{$_('common.loading')}
					</Body>
				{:else if error}
					<Body size="md" color="disabled" align="center">
						{error}
					</Body>
				{:else}
					<div class="balance-amount">
						<span class="balance-value" aria-live="polite" aria-atomic="true">
							{formatSat(totalBalance)}
						</span>
						<span class="balance-unit">{$_('screen.balance.sats')}</span>
					</div>
					<div class="fiat-estimate">
						≈ {estimateFiat(totalBalance)} THB
					</div>
				{/if}

				<div class="balance-status">
					{#if online}
						<span class="status-badge online-badge">{$_('screen.balance.online')}</span>
					{:else}
						<span class="status-badge offline-badge">{$_('screen.balance.offline')}</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- B — Quick Actions -->
		<div class="quick-actions">
			<Heading level="h3">{$_('screen.home.quick_actions')}</Heading>
			<div class="action-buttons-row">
				<!-- F-053/D-013: Receive ซ้าย, Send ขวา -->
				<button type="button" class="action-btn action-receive"
					onclick={(e) => { handleRipple(e); navTo('receive'); }}
					aria-label={$_('wallet.receive')}>
					<span class="action-icon-wrap" aria-hidden="true">
						<Receive size={28} />
					</span>
					<Body size="md" weight="semibold">{$_('wallet.receive')}</Body>
				</button>

				<button type="button" class="action-btn action-send"
					onclick={(e) => { handleRipple(e); navTo('send'); }}
					aria-label={$_('wallet.send')}>
					<span class="action-icon-wrap" aria-hidden="true">
						<Send size={28} />
					</span>
					<Body size="md" weight="semibold">{$_('wallet.send')}</Body>
				</button>
			</div>
		</div>

		<Divider />

		<!-- C — Recent Transactions -->
		<div class="recent-tx-section">
			<div class="section-header">
				<Heading level="h3">{$_('screen.home.recent_tx')}</Heading>
				<div class="section-header-actions">
					<Button variant="ghost" size="sm" loading={refreshing}
						onclick={handleRefresh} ariaLabel="Refresh transactions">
						{#snippet children()}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
								viewBox="0 0 24 24" fill="none" stroke="currentColor"
								stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
								class:spin={refreshing}>
								<polyline points="23 4 23 10 17 10" />
								<polyline points="1 20 1 14 7 14" />
								<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
							</svg>
						{/snippet}
					</Button>
					<Button variant="ghost" size="sm" onclick={() => navTo('history')}>
						{#snippet children()}
							{$_('screen.home.view_all')}
							<ArrowRight size={14} />
						{/snippet}
					</Button>
				</div>
			</div>

			{#if loading}
				<Card variant="basic" padding="md">
					<Body size="sm" color="secondary" align="center">{$_('common.loading')}</Body>
				</Card>
			{:else if recentTxs.length === 0}
				<Card variant="basic" padding="md">
					<Body size="sm" color="secondary" align="center">
						{$_('screen.home.no_tx')}
					</Body>
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
								<div class="tx-status-dot"
									style="background: {statusColor(tx.status)}"
									title={tx.status}></div>
							</div>
						</Card>
					{/each}
				</div>
			{/if}
		</div>

		<!-- D — Safe-area bottom spacer -->
		<div class="bottom-spacer"></div>
	</div>
</div>

<style>
	.home-scroll {
		max-width: 480px;
		margin: 0 auto;
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}

	.home-content {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	/* A — Balance */
	.balance-container {
		background: transparent;
		border-radius: 0;
		padding: var(--space-lg);
		box-shadow: none;
	}

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
		font-size: 4.5rem; /* 72px — F-056: dominant wallet-style */
		font-weight: 800;
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		transition: transform 0.3s ease;
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

	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
	}

	.online-badge {
		background: var(--color-success-light);
		color: var(--color-success);
	}

	.offline-badge {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	/* B — Quick Actions */
	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.action-buttons-row {
		display: flex;
		flex-direction: row;
		gap: var(--space-md);
	}

	.action-btn {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		flex: 1;
		padding: var(--space-lg) var(--space-md);
		border: none;
		border-radius: var(--radius-lg);
		cursor: pointer;
		font-family: var(--font-family);
		overflow: hidden;
		-webkit-tap-highlight-color: transparent;
		transition: transform var(--transition-fast), box-shadow var(--transition-fast);
		min-height: 56px;
	}

	.action-btn:active {
		transform: scale(0.96);
	}

	.action-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.action-send {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
	}

	.action-send:hover {
		background: var(--color-primary-hover);
	}

	.action-receive {
		background: var(--color-surface-variant);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.action-receive:hover {
		background: var(--color-border);
	}

	.action-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Ripple (dynamically created) */
	:global(.ripple-effect) {
		position: absolute;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.35);
		transform: scale(0);
		animation: ripple-anim 0.6s ease-out;
		pointer-events: none;
	}

	@keyframes ripple-anim {
		to { transform: scale(4); opacity: 0; }
	}

	/* C — Recent Transactions */
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

	.section-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
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

	/* D — Bottom Spacer */
	.bottom-spacer {
		height: calc(80px + env(safe-area-inset-bottom, 0px));
	}

	/* Refresh spin */
	.spin {
		animation: spin-rotate 0.8s linear infinite;
	}

	@keyframes spin-rotate {
		to { transform: rotate(360deg); }
	}

	/* Responsive */
	@media (max-width: 767px) {
		.action-btn {
			padding: var(--space-md) var(--space-sm);
		}
		.balance-value {
			font-size: 3rem; /* 48px — F-056: mobile scale-down */
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-btn {
			transition: none !important;
		}
		.spin {
			animation: none !important;
		}
	}
</style>
