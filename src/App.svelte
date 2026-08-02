<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getWalletStatus, type WalletState } from '$lib/wallet/state';
	import type { ScreenKey } from '$lib/router';
	import { getCurrentScreen, navigateTo, onRouteChange } from '$lib/router';
	import { initPwaInstall } from '$lib/pwa-install';
	import { trackWasOffline } from '$lib/offline-indicator';

	// TASK-076 (F-041): Import getActiveMintUrl for mint URL propagation
	// to Receive/Send screens — reads lnwcash_active_mint from localStorage
	import { getActiveMintUrl } from '$lib/wallet/store';

	// TASK-067: Theme reactivity — $effect subscribes to themeMode store
	// and applies data-theme attribute to document.documentElement reactively.
	import { themeMode, resolveTheme, applyThemeDom } from '$lib/design/theme';

	// TASK-051 New Route Screens
	import Home from './screens/Home.svelte';
	import Receive from './screens/Receive.svelte';
	import Send from './screens/Send.svelte';
	import History from './screens/History.svelte';
	import Settings from './screens/Settings.svelte';
	import Setup from './screens/Setup.svelte';

	// TASK-051 Navigation Components
	import BottomNav from './components/BottomNav.svelte';
	import TopAppBar from './components/TopAppBar.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	// Legacy screens kept for backward compatibility (QRScan)
	import F007QRScan from './screens/F007-QRScan.svelte';

	// Integration components
	import SplashScreen from './components/SplashScreen.svelte';
	import ErrorBoundary from './components/ErrorBoundary.svelte';
	import OfflineIndicator from './components/OfflineIndicator.svelte';
	import PwaInstallPrompt from './components/PwaInstallPrompt.svelte';

	type AppView = 'splash' | 'setup' | 'main';

	let walletStatus: WalletState | null = $state(null);
	let activeScreen: ScreenKey = $state('home');
	let appView: AppView = $state('splash');
	let showQRScan: boolean = $state(false);

	// TASK-076 (F-041): Active mint URL for propagation to Receive/Send
	let activeMintUrl: string = $state('');

	// ─── Initialize on mount ──────────────────────────────────
	$effect(() => {
		const pwaCleanup = initPwaInstall();
		const offlineCleanup = trackWasOffline();

		const routeCleanup = onRouteChange((screen: ScreenKey) => {
			activeScreen = screen;
			showQRScan = false;
		});

		// Check wallet state
		try {
			const status = getWalletStatus();
			walletStatus = status;
			if (status.state === 'UNINITIALIZED') {
				appView = 'setup';
			} else if (status.state === 'LOCKED') {
				appView = 'setup';
			} else {
				appView = 'main';
			}
		} catch {
			appView = 'setup';
		}

		// TASK-076 (F-041): Read active mint URL from localStorage
		// Falls back to DEFAULT_MINT_CONFIG.url when no mint configured
		try {
			activeMintUrl = getActiveMintUrl();
		} catch {
			// If localStorage is completely broken, rely on derived fallback
			activeMintUrl = '';
		}

		return () => {
			pwaCleanup();
			offlineCleanup();
			routeCleanup();
		};
	});

	// TASK-067: Reactive theme — subscribe to themeMode store
	// and apply data-theme attribute to DOM on every change.
	$effect(() => {
		const unsub = themeMode.subscribe((mode) => {
			const resolved = resolveTheme(mode);
			applyThemeDom(resolved);
		});
		return unsub;
	});

	// ─── Navigation ───────────────────────────────────────────
	function handleNavigate(screen: ScreenKey) {
		activeScreen = screen;
		showQRScan = false;
		navigateTo(screen);
	}

	// ─── Wallet lifecycle ─────────────────────────────────────
	function handleWalletReady(state: WalletState) {
		walletStatus = state;
		if (state.state === 'UNLOCKED') {
			appView = 'main';
		}
	}

	function handleQRScanRequest() {
		showQRScan = true;
	}

	function handleQRResult(result: string) {
		showQRScan = false;
		if (result.startsWith('lnbc') || result.startsWith('lntb')) {
			navigateTo('send');
		} else if (result.startsWith('cashu')) {
			navigateTo('send');
		} else {
			navigateTo('receive');
		}
	}

	function handleQRClose() {
		showQRScan = false;
	}

	// ─── Back navigation ──────────────────────────────────────
	function handleBack() {
		window.history.back();
	}

	// Determine if back button should show (only on Send/Receive sub-pages per TASK-060)
	let showBack = $derived(activeScreen === 'send' || activeScreen === 'receive');
	let isMainNavScreen = $derived(
		activeScreen === 'home' ||
		activeScreen === 'receive' ||
		activeScreen === 'send' ||
		activeScreen === 'history' ||
		activeScreen === 'settings'
	);

</script>

<ErrorBoundary />

{#if appView === 'splash'}
	<SplashScreen show={true} />
{:else}
	<main class="app-shell">
		{#if showQRScan}
			<div class="qrscan-overlay">
				<F007QRScan onResult={handleQRResult} onClose={handleQRClose} />
			</div>
		{/if}

		<OfflineIndicator variant="banner" />

		{#if appView === 'setup'}
			<div class="setup-container">
				<Setup onWalletReady={handleWalletReady} />
			</div>
		{:else}
			<!-- TASK-079 (F-051): Conditional header — Home/History get full TopAppBar; Send/Receive/Settings get back button only -->
			{#if activeScreen === 'home' || activeScreen === 'history'}
				<TopAppBar screen={activeScreen} showBack={false} onMenuClick={() => navigateTo('settings')} />
			{:else}
				<!-- Send/Receive/Settings: inline back button only — no TopAppBar -->
				<div class="back-header">
					<button
						type="button"
						class="back-btn"
						onclick={handleBack}
						aria-label={$_('common.back')}
					>
						<ArrowLeft size={24} />
					</button>
				</div>
			{/if}

			<!-- Screen Content -->
			<div class="main-content">
				{#if activeScreen === 'home'}
					<Home onQRScan={handleQRScanRequest} />
				{:else if activeScreen === 'receive'}
					<Receive onQRScan={handleQRScanRequest} defaultMintUrl={activeMintUrl} />
				{:else if activeScreen === 'send'}
					<Send onQRScan={handleQRScanRequest} defaultMintUrl={activeMintUrl} />
				{:else if activeScreen === 'history'}
					<History />
				{:else if activeScreen === 'settings'}
					<Settings onBack={handleBack} />
				{/if}
			</div>

			<!-- Bottom Navigation -->
			{#if isMainNavScreen}
				<BottomNav active={activeScreen} onNavigate={handleNavigate} />
			{/if}

			<PwaInstallPrompt />
		{/if}
	</main>
{/if}

<style>
	.app-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
		background: var(--color-background);
		color: var(--color-text);
	}

	.setup-container {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
	}

	.main-content {
		flex: 1;
		padding-bottom: 80px; /* space for bottom nav */
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.qrscan-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: var(--color-surface);
		overflow-y: auto;
	}

	/* TASK-079 (F-051): Back header for secondary screens (Send/Receive/Settings) */
	.back-header {
		display: flex;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		padding-top: calc(var(--space-sm) + env(safe-area-inset-top, 0));
		min-height: 48px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm);
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		-webkit-tap-highlight-color: transparent;
		transition: background var(--transition-fast);
	}

	.back-btn:hover,
	.back-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
