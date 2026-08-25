<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
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

	// TASK-218: App-level auto-lock arming + reactive lock redirect
	import { startAutoLock, walletLockedStore } from '$lib/wallet/autolock';

	// Toast notifications for mint polling feedback
	import { showToast, toastMessage, toastType } from '$lib/stores/toast';

	// TASK-067: Theme reactivity — $effect subscribes to themeMode store
	// and applies data-theme attribute to document.documentElement reactively.
	import { themeMode, resolveTheme, applyThemeDom } from '$lib/design/theme';

	// Background mint polling: check pending mint transactions every 15s
	import { getTransactions, updateTransaction } from '$lib/storage/db';
	import { checkMintQuote } from '$lib/cashu/client';
	import { notifyMintConfirmed, mintBanner } from '$lib/stores/mint-events';
	import Iconly from '$lib/iconly/Iconly.svelte';

	let showBanner = $state(false);
	let bannerAmount = $state(0);
	let bannerTimer: ReturnType<typeof setTimeout> | undefined;

	// Watch store → sync to local state for Svelte 5 reactivity
	$effect(() => {
		const b = $mintBanner;
		if (b.show) {
			showBanner = true;
			bannerAmount = b.amount;
			clearTimeout(bannerTimer);
			bannerTimer = setTimeout(() => showBanner = false, 5000);
		}
	});

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

	// QRScanner overlay (D-6 γ — was F007QRScan, see TASK-505)
	import QRScanner from '$lib/components/QRScanner.svelte';

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
			// TASK-272 (fix 6b/7): <Setup> renders ONLY under appView === 'setup'.
			// Navigating to the /setup route (delete → reset, forgot-PIN, direct
			// URL) must flip appView to 'setup' so the centered setup-container
			// renders — never a duplicate <Setup> inside main-content.
			if (screen === 'setup') {
				try {
					walletStatus = getWalletStatus();
				} catch {
					// ignore — keep the previous walletStatus
				}
				appView = 'setup';
			}
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
					// TASK-218: arm auto-lock app-wide once unlocked
					walletLockedStore.set(false);
					startAutoLock();
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

	// TASK-218: Reactive lock redirect — when the wallet locks (auto or manual)
	// via `walletLockedStore`, immediately flip to the unlock (setup) screen
	// without requiring a page refresh.
	$effect(() => {
		const unsub = walletLockedStore.subscribe((locked) => {
			if (locked) {
				walletStatus = getWalletStatus();
				appView = 'setup';
			}
		});
		return unsub;
	});

	// ─── Background mint polling ──────────────────────────────
	// Poll pending mint transactions every 5s — works on any screen.
	let pollInterval: ReturnType<typeof setInterval> | undefined;

	onMount(() => {

		async function poll() {
			try {
				const allTxs = await getTransactions();
				const pendingTxs = allTxs.filter(tx => tx.type === 'mint' && tx.status === 'pending');
				if (pendingTxs.length === 0) return;

				for (const tx of pendingTxs) {
					try {
						const quoteId = tx.id.startsWith('mint-') ? tx.id.slice(5) : tx.id;
						const quote = await checkMintQuote(tx.mint_url, quoteId);
						const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');

						if (state === 'PAID' || state === 'ISSUED') {
							try {
						await updateTransaction(tx.id, { status: 'confirmed' });
							} catch (upErr) {
								console.error(`[mint-poll] ❌ updateTransaction failed:`, upErr);
							}
							notifyMintConfirmed(tx.amount);
						} else if (state === 'EXPIRED') {
							await updateTransaction(tx.id, { status: 'failed' });
							console.log(`[mint-poll] Mint expired: ${tx.id}`);
						}
					} catch (txErr) {
						console.warn(`[mint-poll] Error checking mint tx ${tx.id}:`, txErr);
					}
				}
			} catch (err) {
				console.warn('[mint-poll] Poll iteration error:', err);
			}
		}

		poll();
		pollInterval = setInterval(poll, 5_000);

		return () => {
			if (pollInterval) clearInterval(pollInterval);
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
			// TASK-218: arm auto-lock app-wide + reset the lock signal
			walletLockedStore.set(false);
			startAutoLock();
			// TASK-272 (fix 6a): after flipping to 'main', clear a stale '/setup'
			// hash and navigate home. <Setup> now renders ONLY under
			// appView === 'setup' (fix 7), so a leftover /setup hash would
			// otherwise leave the main content blank after unlock/create.
			if (getCurrentScreen() === 'setup') {
				navigateTo('home');
			}
		} else if (state.state === 'LOCKED') {
			// TASK-272 (fix 6d): handle LOCKED (not only UNLOCKED) — keep the app
			// on the setup (unlock) screen instead of ignoring the state and
			// leaving a stale view behind.
			appView = 'setup';
		}
	}

	function handleQRScanRequest() {
		showQRScan = true;
	}

	async function handleQRResult(result: string) {
		// TASK-FIX-iter5: strip URI scheme prefix (lightning:/bitcoin:) before
		// any downstream handling so the store, Send.svelte, and Receive.svelte
		// all see the canonical form. Routing uses the same canonical string.
		const stripped = result.replace(/^(lightning:|bitcoin:)/i, '');
		// Lightning Address (user@domain) is case-sensitive (email-style).
		// bolt11/lnurl bech32 is case-insensitive — lowercase for store
		// consistency so downstream detectInputType / decodeBolt11 / isLnurlBech32
		// all see canonical lowercase. Detection: if stripped contains '@'
		// it's likely LA; preserve case for resolution.
		const looksLikeLightningAddress = stripped.includes('@');
		scannedQRValue.set(looksLikeLightningAddress ? stripped : stripped.toLowerCase());
		// Detect type from lowercased result (handles lightning: prefix)
		const lowered = stripped.toLowerCase();
		if (lowered.startsWith('lnbc') || lowered.startsWith('lntb') || lowered.startsWith('lnurl')) {
			navigateTo('send');
		} else if (lowered.includes('@')) {
			// TASK-FIX-iter5: bare lightning address (alice@domain.tld) → Send
			navigateTo('send');
		} else if (lowered.startsWith('cashua') || lowered.startsWith('cashub') || lowered.startsWith('cashu')) {
			navigateTo('receive');
		} else {
			navigateTo('receive');
		}
		// TASK-509 (iter5): delay closing the overlay by 500ms so the user
		// sees the "Frame 100%" completion state on animated (NUT-16) QR
		// scans before the scanner unmounts. Pattern source: cashu.me.
		await new Promise((resolve) => setTimeout(resolve, 500));
		showQRScan = false;
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
				<div class="qrscan-header">
					<button
						type="button"
						class="qrscan-header-close"
						aria-label={$_('common.close')}
						onclick={handleQRClose}
					>
						×
					</button>
					<h2 class="qrscan-header-title">{$_('screen.common.scanner_overlay_title')}</h2>
					<div class="qrscan-header-spacer"></div>
				</div>
				<div class="qrscan-body">
					<QRScanner onDecode={handleQRResult} onClose={handleQRClose} />
				</div>
			</div>
		{/if}

		<OfflineIndicator variant="banner" />

		<!-- Mint success banner -->
		{#if showBanner}
			<div class="mint-banner">
				<span class="mint-banner-icon">
					<Iconly name="Check" size={18} color="currentColor" />
				</span>
				<span>รับเงินสำเร็จ +{bannerAmount} sats</span>
			</div>
		{/if}

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

			<!-- Toast notification -->
			{#if $toastMessage}
				<div class="global-toast toast-{$toastType}">
					{$toastMessage}
				</div>
			{/if}
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
		z-index: var(--z-modal-backdrop);
		background: #000;
		display: flex;
		flex-direction: column;
		/* Safe area for iOS notch + Android gesture bar */
		padding-top: env(safe-area-inset-top, 0);
		padding-bottom: env(safe-area-inset-bottom, 0);
		padding-left: env(safe-area-inset-left, 0);
		padding-right: env(safe-area-inset-right, 0);
		overflow: hidden;
	}

	.qrscan-header {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		padding: 0 var(--space-md);
		background: #000;
		color: #fff;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.qrscan-header-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin-left: calc(-1 * var(--space-sm));
		border: none;
		border-radius: 50%;
		background: transparent;
		color: #fff;
		font-size: 28px;
		line-height: 1;
		cursor: pointer;
		transition: background var(--transition-fast, 120ms ease);
		-webkit-tap-highlight-color: transparent;
	}

	.qrscan-header-close:hover,
	.qrscan-header-close:focus-visible {
		background: rgba(255, 255, 255, 0.1);
		outline: none;
	}

	.qrscan-header-close:focus-visible {
		outline: 2px solid var(--color-primary, #1976d2);
		outline-offset: 2px;
	}

	.qrscan-header-title {
		flex: 1;
		margin: 0;
		text-align: center;
		font-family: var(--font-family, sans-serif);
		font-size: var(--font-size-md, 16px);
		font-weight: var(--font-weight-semibold, 600);
		color: #fff;
	}

	.qrscan-header-spacer {
		width: 40px;
		flex-shrink: 0;
	}

	.qrscan-body {
		flex: 1 1 auto;
		display: flex;
		align-items: stretch;
		justify-content: center;
		min-height: 0;
		overflow: hidden;
	}

	/* Override QRScanner.svelte's .qr-scanner { max-width: 480px } when
	   mounted inside the global full-screen overlay so the camera preview
	   fills the available height/width. The :global() is required because
	   Svelte scopes component-internal classes by default. */
	.qrscan-body :global(.qr-scanner) {
		max-width: none;
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		border-radius: 0;
	}

	.qrscan-body :global(.qr-scanner-video) {
		object-fit: cover;
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

	/* ─── Toast notification ──────────────────────────── */
	.global-toast {
		position: fixed;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		padding: 12px 24px;
		border-radius: var(--radius-lg);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		z-index: 9999;
		box-shadow: var(--shadow-lg);
		animation: toast-in 0.3s ease;
	}
	.toast-success { background: #14b8a6; color: #fff; }
	.toast-error { background: #ef4444; color: #fff; }
	.toast-info { background: var(--color-surface); color: var(--color-text-primary); }

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(20px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	/* Mint success banner */
	.mint-banner {
		position: fixed;
		top: 56px;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px;
		background: #00bcd4;
		color: #fff;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		animation: banner-in 0.3s ease;
	}

	@media (prefers-color-scheme: light) {
		.mint-banner {
			background: rgba(0, 188, 212, 0.12);
			color: #008394;
		}
	}

	.mint-banner-icon {
		display: flex;
		align-items: center;
	}

	@keyframes banner-in {
		from { transform: translateY(-100%); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}
</style>
