<script lang="ts">
	/**
	 * Home Dashboard — Wallet Page Redesign (TASK-059)
	 * Home-centric: Balance display + Send/Receive + Recent transactions
	 * Design token: LNWCASH Cyan = #00bcd4
	 *
	 * Svelte 5 runes: $state, $derived, $effect
	 */
	import { onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { getBalanceByMint } from '$lib/wallet/balance';
	import { isOnline, onConnectivityChange } from '$lib/wallet/offline';
	import { navigateTo } from '$lib/router';
	import type { ScreenKey } from '$lib/router';
	import { activeMintStore, getActiveMintUrl } from '$lib/wallet/store';
	import { mintConfirmed } from '$lib/stores/mint-events';

	let _lastBalance: number = Number(sessionStorage.getItem('lnw_last_balance') || 0);
	let _initialized: boolean = sessionStorage.getItem('lnw_balance_init') === '1';

	// TASK-050 Design System Components
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';

	// TASK-050 Icons (Home page uses vertical up/down for quick action buttons)
	import ReceiveVertical from '$lib/components/icons/ReceiveVertical.svelte';
	import SendVertical from '$lib/components/icons/SendVertical.svelte';

	// TASK-145 Iconly
	import Iconly from '$lib/iconly/Iconly.svelte';

	interface Props {
		onQRScan?: () => void;
	}

	let { onQRScan }: Props = $props();

	let totalBalance: number = $state(0);
	let loading: boolean = $state(true);
	let error: string = $state('');
	let online: boolean = $state(isOnline());
	let currentMintUrl: string = $state(getActiveMintUrl());

	let displayBalance: number = $state(_lastBalance);
	let animFrame: number | undefined;
	let lastTarget: number = $state(_lastBalance);

	function animateTo(target: number) {
		if (target === lastTarget && displayBalance === target) return;
		lastTarget = target;
		if (animFrame) cancelAnimationFrame(animFrame);
		const start = displayBalance;
		const diff = target - start;
		if (diff === 0) return;

		const duration = 1200; // ms
		const startTime = performance.now();

		function step(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// easeOutCubic
			const eased = 1 - Math.pow(1 - progress, 3);
			displayBalance = Math.round(start + diff * eased);
			if (progress < 1) {
				animFrame = requestAnimationFrame(step);
			}
		}
		animFrame = requestAnimationFrame(step);
	}

	$effect(() => {
		const cleanupConnectivity = onConnectivityChange((status: boolean) => {
			online = status;
		});

		let init = true;
		const unsubMint = activeMintStore.subscribe((url: string) => {
			if (init) { init = false; return; } // skip initial fire
			if (url && url !== currentMintUrl) {
				currentMintUrl = url;
				loadBalance();
			}
		});

		loadAll();

		return () => {
			cleanupConnectivity();
			unsubMint();
		};
	});

	// Reload + animate when mint confirmed in background
	$effect(() => {
		const _ = $mintConfirmed;
		loadBalance();
	});

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame);
	});

	async function loadAll() {
		try {
			await loadBalance();
		} finally {
			loading = false;
		}
	}

	async function loadBalance() {
		error = '';
		try {
			// F-068: Home balance = active mint balance (not total all mints)
			const mintUrl = getActiveMintUrl();
			const balance = await getBalanceByMint(mintUrl);
			const prev = _lastBalance;
			totalBalance = balance;
			if (!_initialized) {
				displayBalance = balance;
				lastTarget = balance;
				_lastBalance = balance;
				sessionStorage.setItem('lnw_last_balance', String(balance));
				sessionStorage.setItem('lnw_balance_init', '1');
				_initialized = true;
			} else if (balance !== prev) {
				_lastBalance = balance;
				sessionStorage.setItem('lnw_last_balance', String(balance));
				animateTo(balance);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		}
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
							{formatSat(displayBalance)}
						</span>
						<span class="balance-unit">{$_('screen.balance.sats')}</span>
					</div>
					<div class="fiat-estimate">
						≈ {estimateFiat(displayBalance)} THB
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
			<div class="action-buttons-row">
				<!-- F-053/D-013: Receive ซ้าย, Send ขวา -->
				<button type="button" class="action-btn action-receive"
					onclick={(e) => { handleRipple(e); navTo('receive'); }}
					aria-label={$_('wallet.receive')}>
					<span class="action-icon-wrap" aria-hidden="true">
						<ReceiveVertical size={28} />
					</span>
					<Body size="md" weight="semibold">{$_('wallet.receive')}</Body>
				</button>

				<button type="button" class="action-btn action-send"
					onclick={(e) => { handleRipple(e); navTo('send'); }}
					aria-label={$_('wallet.send')}>
					<span class="action-icon-wrap" aria-hidden="true">
						<SendVertical size={28} />
					</span>
					<Body size="md" weight="semibold">{$_('wallet.send')}</Body>
				</button>
			</div>
		</div>

		<!-- C — History Button -->
		<button type="button" class="history-btn" onclick={() => navTo('history')}
			aria-label={$_('screen.history.title')}>
			<span class="history-btn-icon" aria-hidden="true">
				<Iconly name="History" size={20} />
			</span>
			<Body size="sm" weight="medium">{$_('screen.history.title')}</Body>
			<span class="history-btn-arrow" aria-hidden="true">
				<Iconly name="ArrowRight" size={16} />
			</span>
		</button>

		<!-- D — Safe-area bottom spacer -->
		<div class="bottom-spacer"></div>
	</div>
</div>

<style>
	.home-scroll {
		max-width: 480px;
		margin: 0 auto;
		min-height: calc(100dvh - 56px - 80px);
		display: flex;
		flex-direction: column;
		justify-content: center;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}

	.home-content {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* A — Balance */
	.balance-container {
		background: transparent;
		border-radius: 0;
		padding: var(--space-sm) var(--space-lg) 0;
		box-shadow: none;
		display: flex;
		flex-direction: column;
		justify-content: center;
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

	/* TASK-1521 เฉด ก (L-P008): light theme offline badge — ส้มจาง+น้ำตาลส้มเข้มให้เข้าธีมสว่าง
	   base token-driven คง (dark ใช้ต่อ) — rule เดียว ไม่แตะ dark/online/token กลาง */
	:global([data-theme='light']) .offline-badge {
		background: rgba(245, 127, 23, 0.18);
		color: #bf360c;
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

	/* C — History Button */
	.history-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-xs);
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-family);
		color: var(--color-text-primary);
		-webkit-tap-highlight-color: transparent;
		transition: opacity var(--transition-fast);
	}

	.history-btn:active {
		opacity: 0.6;
	}

	.history-btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.history-btn-arrow {
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
	}

	/* D — Bottom Spacer */
	.bottom-spacer {
		height: calc(80px + env(safe-area-inset-bottom, 0px));
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
	}
</style>
