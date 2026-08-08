<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getWalletStatus, tryAutoUnlock, type WalletState } from '$lib/wallet/state';
	import type { ScreenKey } from '$lib/router';
	import { getCurrentScreen, navigateTo, onRouteChange } from '$lib/router';
	import { initPwaInstall } from '$lib/pwa-install';
	import { trackWasOffline } from '$lib/offline-indicator';

	// TASK-076 (F-041) / TASK-091 (F-066): Import reactive activeMintStore
	// for mint URL propagation to Receive/Send screens.
	// Uses Svelte writable store — auto-reacts on mint switch (no page reload).
	import { activeMintStore } from '$lib/wallet/store';

	// TASK-122: Shared QR scan value store — QRScan writes, Send/Receive reads
	import { scannedQRValue } from '$lib/stores/scannedQR';

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

	// ─── Initialize on mount ──────────────────────────────────
	$effect(() => {
		const pwaCleanup = initPwaInstall();
		const offlineCleanup = trackWasOffline();

		const routeCleanup = onRouteChange((screen: ScreenKey) => {
			activeScreen = screen;
			showQRScan = false;
		});

		// TASK-092 (F-061): Wallet state + auto-unlock via sessionStorage PIN
		// Sync check: determine tentative view. Auto-unlock (async below)
		// will restore in-memory private key from sessionStorage PIN after refresh.
		let tentativeView: AppView = 'setup';
		try {
			const status = getWalletStatus();
			walletStatus = status;
			if (status.state === 'UNINITIALIZED') {
				tentativeView = 'setup';
			} else if (status.state === 'LOCKED') {
				tentativeView = 'setup';
			} else {
				// UNLOCKED in localStorage — tentative main,
				// but auto-unlock will verify/fix private key availability
				tentativeView = 'main';
			}
		} catch {
			tentativeView = 'setup';
		}
		appView = tentativeView;

		// TASK-092 (F-061): Async auto-unlock attempt.
		// Restores in-memory private key from sessionStorage PIN after page refresh.
		// If tentativeView was 'main' but private key is missing, downgrades to 'setup'.
		(async () => {
			const status = getWalletStatus();
			if (status.state === 'UNINITIALIZED') return; // nothing to unlock

			try {
				const didUnlock = await tryAutoUnlock();
				if (didUnlock) {
					walletStatus = getWalletStatus();
					appView = 'main';
				} else if (tentativeView === 'main') {
					// UNLOCKED in localStorage but private key missing
					// and no valid session PIN → force unlock screen
					appView = 'setup';
				}
			} catch {
				// Auto-unlock failed — keep tentative view or downgrade
				if (tentativeView === 'main') {
					appView = 'setup';
				}
			}
		})();

		// TASK-091 (F-066): reactiveMintStore auto-initialized from localStorage
		// on module load — no manual read needed. $activeMintStore in template
		// auto-subscribes and reactively propagates to Receive/Send props.

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
		scannedQRValue.set(result);
		// Detect type from lowercased result (handles lightning: prefix)
		const lowered = result.replace(/^(lightning:|bitcoin:)/i, '').toLowerCase();
		if (lowered.startsWith('lnbc') || lowered.startsWith('lntb') || lowered.startsWith('lnurl')) {
			navigateTo('send');
		} else if (lowered.startsWith('cashua') || lowered.startsWith('cashub') || lowered.startsWith('cashu')) {
			navigateTo('receive');
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
	let showBack = $derived((activeScreen as string) === 'send' || (activeScreen as string) === 'receive');
	let isMainNavScreen = $derived(
		(activeScreen as string) === 'home' ||
		(activeScreen as string) === 'receive' ||
		(activeScreen as string) === 'send' ||
		(activeScreen as string) === 'history' ||
		(activeScreen as string) === 'settings'
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
			<!-- TASK-086 (F-057): Header dedup — Home/History get full TopAppBar; other screens use own headers -->
			{#if (activeScreen as string) === 'home' || (activeScreen as string) === 'history'}
				<TopAppBar screen={activeScreen} showBack={false} onMenuClick={() => navigateTo('settings')} />
			{/if}

			<!-- Screen Content -->
			<div class="main-content">
				{#if (activeScreen as string) === 'home'}
					<Home onQRScan={handleQRScanRequest} />
				{:else if (activeScreen as string) === 'receive'}
					<Receive onQRScan={handleQRScanRequest} defaultMintUrl={$activeMintStore} />
				{:else if (activeScreen as string) === 'send'}
					<Send onQRScan={handleQRScanRequest} defaultMintUrl={$activeMintStore} />
				{:else if (activeScreen as string) === 'history'}
					<History />
				{:else if (activeScreen as string) === 'settings'}
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
