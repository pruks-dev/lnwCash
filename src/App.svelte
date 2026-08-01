<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getWalletStatus, type WalletState } from '$lib/wallet/state';
	import type { ScreenKey } from '$lib/router';
	import { getCurrentScreen, navigateTo, onRouteChange } from '$lib/router';
	import { initPwaInstall } from '$lib/pwa-install';
	import { trackWasOffline } from '$lib/offline-indicator';

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

		return () => {
			pwaCleanup();
			offlineCleanup();
			routeCleanup();
		};
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

	// Determine if back button should show (not on home)
	let showBack = $derived(activeScreen !== 'home' && activeScreen !== 'settings');
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
			<!-- Top App Bar -->
			<TopAppBar screen={activeScreen} showBack={showBack} onBack={handleBack} />

			<!-- Screen Content -->
			<div class="main-content">
				{#if activeScreen === 'home'}
					<Home onQRScan={handleQRScanRequest} />
				{:else if activeScreen === 'receive'}
					<Receive onQRScan={handleQRScanRequest} />
				{:else if activeScreen === 'send'}
					<Send onQRScan={handleQRScanRequest} />
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
</style>
