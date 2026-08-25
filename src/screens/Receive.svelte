<script lang="ts">
	/**
	 * Receive Screen — TASK-066 Complete Redesign
	 *
	 * Two tabs: Lightning (invoice generation) + Cashu (token redemption)
	 *
	 * Lightning tab flow:
	 *   idle → enter amount (numpad) → create invoice (loading) → display invoice + QR
	 *   → copy → poll status (pulse) → success (checkmark + count-up)
	 *
	 * Cashu tab flow:
	 *   idle → paste token → validate → preview → receive (loading) → success
	 *
	 * All UI states: idle, loading, success, error, timeout
	 */
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { scannedQRValue } from '$lib/stores/scannedQR';
	import { completeMint, type MintResult } from '$lib/wallet/mint';
	import { receiveTokens, type ReceiveResult } from '$lib/wallet/tokenStore';
	import { isCashuToken, getTokenAmount, decodeToken } from '$lib/cashu/token';
	import { CashuError } from '$lib/cashu/client';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
	import { addTransaction, updateTransaction } from '$lib/storage/db';
	import { getBalance } from '$lib/wallet/balance';
	import { getPrivateKey, storeSessionPin, unlockWallet } from '$lib/wallet/state';
	import { WalletLockedError } from '$lib/wallet/errors';
	import { withTransactionGuard } from '$lib/wallet/autolock';
	import { getMintConfig } from '$lib/wallet/store';
	import { navigateTo } from '$lib/router';
	import { notifyMintConfirmed } from '$lib/stores/mint-events';

	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Numpad from '$lib/components/Numpad.svelte';
	import QRDisplay from '$lib/components/QRDisplay.svelte';
	import UnlockPrompt from '../components/UnlockPrompt.svelte';

	import Copy from '$lib/components/icons/Copy.svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import Time from '$lib/components/icons/Time.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Close from '$lib/components/icons/Close.svelte';

	// TASK-159 Iconly wrapper — unified icon system
	import Iconly from '$lib/iconly/Iconly.svelte';

	interface Props {
		defaultMintUrl?: string;
		onQRScan?: () => void;
	}

	let { defaultMintUrl = '', onQRScan }: Props = $props();

	// ─── Tab state ───────────────────────────────────────────
	type TabKey = 'lightning' | 'cashu';
	let activeTab: TabKey = $state('lightning');

	// ─── Lightning state ─────────────────────────────────────
	type LightningState = 'idle' | 'loading' | 'invoice' | 'polling' | 'success' | 'error';
	let lightningState: LightningState = $state('idle');
	function isLightningDisabled(): boolean {
		const s: LightningState = lightningState;
		return s === 'loading' || s === 'polling';
	}
	let lightningAmount: string = $state('0');
	let lightningInvoice: string = $state('');
	let lightningQrData: string = $state('');
	let lightningError: string = $state('');
	let lightningResult: MintResult | null = $state(null);
	let pollCount: number = $state(0);
	let displayBalance: number = $state(0);

	// Phase-tracked minting — TASK-068 two-phase mint flow
	let pendingQuoteId: string = $state('');
	let pendingAmount: number = $state(0);
	let pendingTxId: string | null = $state(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	// Re-entrancy guard: prevents double-submit of the mint when overlapping
	// poll callbacks both observe the quote as PAID (intermittent 400).
	let mintCompleting: boolean = $state(false);

	// ─── Cashu state ─────────────────────────────────────────
	type CashuState = 'idle' | 'validating' | 'preview' | 'loading' | 'success' | 'error';
	let cashuState: CashuState = $state('idle');
	let cashuTokenInput: string = $state('');
	let cashuDecodedToken: { amount: number; mint: string; proofCount: number } | null = $state(null);
	let cashuError: string = $state('');
	let cashuReceiveResult: ReceiveResult | null = $state(null);
	let mintUrl: string = $state('');

	// ─── Toast ───────────────────────────────────────────────
	let toastMessage: string = $state('');
	let toastType: 'info' | 'success' | 'error' = $state('info');
	let toastVisible: boolean = $state(false);

	// TASK-092 (F-061): Unlock prompt state for wallet lock fallback
	let showUnlockPrompt: boolean = $state(false);
	let unlockPendingOp: (() => Promise<void>) | null = $state(null);

	function handleUnlockSuccess() {
		showUnlockPrompt = false;
		if (unlockPendingOp) {
			const retry = unlockPendingOp;
			unlockPendingOp = null;
			retry();
		}
	}

	function handleUnlockCancel() {
		showUnlockPrompt = false;
		unlockPendingOp = null;
		// Reset states so UI isn't stuck
		if (lightningState === 'loading') {
			lightningState = 'idle';
		}
		if (cashuState === 'loading') {
			cashuState = 'idle';
		}
	}

	// F-066: Reactive mint URL subscription — propagates from App.svelte via props.
	// The old `!mintUrl` guard has been REMOVED. Now mintUrl always follows
	// defaultMintUrl so that Mint Settings switch immediately updates Receive.
	$effect(() => {
		if (defaultMintUrl) {
			if (mintUrl && mintUrl !== defaultMintUrl) {
				// Show toast on mint switch
				try {
					const config = getMintConfig(defaultMintUrl);
					const name = config?.name || defaultMintUrl;
					showToast(`Switched to mint: ${name}`, 'info');
				} catch {
					showToast(`Switched to mint: ${defaultMintUrl}`, 'info');
				}
			}
			mintUrl = defaultMintUrl;
		}
	});

	// TASK-122: Read scanned QR value from shared store (QRScan → Receive)
	// TASK-FIX-409 (P3): Removed the URL hash-param fallback for `token` —
	// cashuB tokens can exceed the browser's ~32-65KB URL hash limit and get
	// silently truncated. The shared `scannedQRValue` store now carries the
	// full token from F007-QRScan (and clipboard/manual paste paths still
	// write to `cashuTokenInput` directly).
	onMount(() => {
		const unsub = scannedQRValue.subscribe((value) => {
			if (value && (value.startsWith('cashuA') || value.startsWith('cashuB') || value.startsWith('cashu'))) {
				cashuTokenInput = value;
				activeTab = 'cashu';
				scannedQRValue.set(null);
				validateToken();
			}
		});

		return unsub;
	});

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
	}

	// ─── Lightning tab handlers ──────────────────────────────

	function handleLightningAmountChange(value: string) {
		lightningAmount = value;
	}

	// ─── Thin wrapper: check mint quote state (NUT-04) ───────
	/**
	 * Thin wrapper over requestMintQuote — includes `unit: "sat"` required by Nutshell.
	 * Uses the resolveEndpointPath for NUT-19 cache compatibility.
	 */
	async function requestMintQuoteWithUnit(mintUrl: string, amount: number): Promise<{ quote: string; request: string; state: string }> {
		const url = `${mintUrl.replace(/\/+$/, '')}/v1/mint/quote/bolt11`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
				body: JSON.stringify({ amount, unit: 'sat' }),
				signal: controller.signal
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new CashuError(`HTTP ${res.status}: ${(errData as Record<string,unknown>).detail || res.statusText}`, res.status);
			}
			return await res.json() as { quote: string; request: string; state: string };
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * GET /v1/mint/quote/bolt11/{quote_id} → { state, ... }
	 * Returns the quote state string: UNPAID | PAID | ISSUED | EXPIRED
	 */
	async function getMintQuoteState(mintUrl: string, quoteId: string): Promise<string> {
		const url = `${mintUrl.replace(/\/+$/, '')}/v1/mint/quote/bolt11/${encodeURIComponent(quoteId)}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		try {
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) {
				throw new CashuError(`HTTP ${res.status}`, res.status);
			}
			const data = await res.json();
			return (data as Record<string, unknown>).state as string ?? 'UNKNOWN';
		} finally {
			clearTimeout(timeout);
		}
	}

	// ─── Thin wrapper: update balance display ────────────────
	async function updateBalanceDisplay(): Promise<number> {
		try {
			const bal = await getBalance();
			return bal.total;
		} catch {
			return 0;
		}
	}

	// ─── Error mapping: API errors → user-friendly ───────────
	function mapMintError(error: unknown): string {
		if (error instanceof CashuError) {
			if (error.status === 404) return $_('screen.receive.error_mint_404');
			if (error.status === 403) return $_('screen.receive.error_mint_forbidden');
			if (error.status && error.status >= 500) return $_('screen.receive.error_mint_server');
			return $_('screen.receive.error_mint_fail');
		}
		if (error instanceof Error) {
			const msg = error.message.toLowerCase();
			if (msg.includes('fetch') || msg.includes('network') || msg.includes('unreachable'))
				return $_('screen.receive.error_mint_unreachable');
			if (msg.includes('timeout'))
				return $_('screen.receive.error_mint_timeout');
			if (msg.includes('expired') || msg.includes('timeout'))
				return $_('screen.receive.error_quote_expired');
		}
		return $_('screen.receive.error_mint_fail');
	}

	/**
	 * Phase 1: Request mint quote → get invoice → display QR
	 * Phase 2 will start via polling after invoice display.
	 */
	async function handleCreateInvoice() {
		const amount = parseFloat(lightningAmount);
		if (isNaN(amount) || amount <= 0) {
			lightningError = $_('screen.receive.amount_required');
			lightningState = 'error';
			return;
		}
		if (!mintUrl.trim()) {
			lightningError = $_('common.error_mint_url_required');
			lightningState = 'error';
			return;
		}

		lightningState = 'loading';
		lightningError = '';

		try {
			const mintUrlClean = mintUrl.trim();

			// Phase 1a: Request mint quote from real mint (thin wrapper with unit support)
			const quote = await requestMintQuoteWithUnit(mintUrlClean, Math.floor(amount));
			pendingQuoteId = quote.quote;
			pendingAmount = Math.floor(amount);

			// Phase 1b: Display the bolt11 invoice as QR
			lightningInvoice = quote.request;

			// Create pending transaction for the mint (best-effort)
			pendingTxId = `mint-${quote.quote}`;
			try {
				await addTransaction({
					id: pendingTxId,
					type: 'mint',
					protocol: 'lightning',
					amount: Math.floor(amount),
					mint_url: mintUrlClean,
					timestamp: Date.now(),
					token_hash: null,
					invoice: quote.request,
					status: 'pending',
					fee: 0
				});
			} catch { /* best-effort */ }

			lightningQrData = `lightning:${quote.request}`;
			lightningState = 'invoice';

			// Phase 1c: Start polling for payment
			lightningState = 'polling';
			pollCount = 0;
			mintCompleting = false;
			startQuotePolling();
		} catch (e) {
			lightningError = mapMintError(e);
			lightningState = 'error';
			showToast(lightningError, 'error');
		}
	}

	/**
	 * Real polling: check mint quote state every 3 seconds.
	 * Max ~60 polls (~3 minutes) then timeout.
	 */
	function startQuotePolling() {
		// Clean up any previous poll
		if (pollTimer) clearInterval(pollTimer);

		pollTimer = setInterval(async () => {
			if (mintCompleting) return;
			pollCount++;
			if (pollCount >= 60) {
				// Timeout after ~3 minutes
				clearInterval(pollTimer!);
				pollTimer = null;
				lightningError = $_('screen.receive.error_payment_timeout');
				lightningState = 'error';
				showToast(lightningError, 'error');
				return;
			}

			try {
				const state = await getMintQuoteState(mintUrl.trim(), pendingQuoteId);
				// Re-check after the await: a slower overlapping callback may have
				// already started completing the mint while this one was in flight.
				if (mintCompleting) return;
				if (state === 'PAID') {
					mintCompleting = true;
					clearInterval(pollTimer!);
					pollTimer = null;
					await completeMintAfterPayment();
				} else if (state === 'EXPIRED') {
					clearInterval(pollTimer!);
					pollTimer = null;
					lightningError = $_('screen.receive.error_quote_expired');
					lightningState = 'error';
					showToast(lightningError, 'error');
				}
				// UNPAID: keep polling (no-op)
			} catch {
				// Network errors during polling are transient — keep trying
				// Only fail after too many consecutive errors
			}
		}, 3000);
	}

	/**
	 * Phase 2: Complete mint after quote is PAID.
	 * Delegates output creation (deterministic NUT-13), submit, unblind and
	 * store to `completeMint()` in mint.ts. Auto-lock is suspended while the
	 * mint is in flight (F-027-004).
	 */
	async function completeMintAfterPayment() {
		lightningState = 'loading';

		try {
			const mintUrlClean = mintUrl.trim();
			getPrivateKey(); // ensure wallet is unlocked (throws WalletLockedError → unlock prompt)

			// Step 1: Get keysets (completeMint requires the keysetId)
			const keysets = await fetchAndCacheKeysets(mintUrlClean);
			const activeKeysets = keysets.filter(k => k.active);
			if (activeKeysets.length === 0) {
				throw new Error('No active keysets found for this mint');
			}
			const keysetId = activeKeysets[0].id;

			// Step 2: Complete the mint via the deterministic mint.ts path.
			// Blinded-output creation (NUT-13 from the active seed), submit,
			// unblind, store and counter_k advancement all happen inside
			// completeMint(). wrap with withTransactionGuard() so the wallet is
			// never auto-locked mid-mint (F-027-004 mint half).
			const result = await withTransactionGuard(() =>
				completeMint(mintUrlClean, pendingQuoteId, pendingAmount, keysetId, true)
			);

			if (!result.success) {
				// completeMint returns (does not throw) on failure. Surface a
				// locked-wallet error as WalletLockedError so the unlock-prompt
				// retry flow still works.
				if (result.error && result.error.toLowerCase().includes('wallet is locked')) {
					throw new WalletLockedError();
				}
				throw new Error(result.error ?? $_('screen.receive.error_mint_fail'));
			}
			const proofs = result.proofs;

			// Step 6.5: Update pending transaction to confirmed — best-effort
			try {
				if (pendingTxId) await updateTransaction(pendingTxId, { status: 'confirmed' });
				notifyMintConfirmed(pendingAmount);
			} catch {
				// IndexedDB may be unavailable — transaction recording is best-effort
			}

			// Step 7: Update balance
			await updateBalanceDisplay();

			// Set result for display
			lightningResult = {
				success: true,
				proofs,
				quote: pendingQuoteId,
				amount: pendingAmount
			};

			lightningState = 'success';
			mintCompleting = false;
			animateBalance(0, pendingAmount);
			showToast($_('screen.receive.success_received'), 'success');
		} catch (e) {
			// TASK-092 (F-061): Wallet lock fallback — show unlock prompt + retry
			if (e instanceof WalletLockedError) {
				lightningState = 'idle';
				unlockPendingOp = () => completeMintAfterPayment();
				showUnlockPrompt = true;
				return;
			}
			lightningError = mapMintError(e);
			lightningState = 'error';
			mintCompleting = false;
			showToast(lightningError, 'error');

			// Mark pending transaction as failed
			try { if (pendingTxId) await updateTransaction(pendingTxId, { status: 'failed' }); } catch { /* best-effort */ }
		}
	}

	function animateBalance(from: number, to: number) {
		const duration = 1000;
		const start = performance.now();
		function step(now: number) {
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			// easeOutCubic
			const eased = 1 - Math.pow(1 - progress, 3);
			displayBalance = Math.round(from + (to - from) * eased);
			if (progress < 1) {
				requestAnimationFrame(step);
			} else {
				displayBalance = to;
			}
		}
		requestAnimationFrame(step);
	}

	async function handleCopyInvoice() {
		try {
			await navigator.clipboard.writeText(lightningInvoice);
			showToast($_('common.copied'), 'success');
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		}
	}

	function resetLightning() {
		// Clean up poll timer
		if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
		lightningState = 'idle';
		lightningAmount = '0';
		lightningInvoice = '';
		lightningQrData = '';
		lightningError = '';
		lightningResult = null;
		pollCount = 0;
		displayBalance = 0;
		pendingQuoteId = '';
		pendingAmount = 0;
		pendingTxId = null;
	}

	function handleOkAndNavigateLightning() {
		resetLightning();
		navigateTo('home');
	}

	// ─── Cashu tab handlers ──────────────────────────────────

	function handleCashuInput(e: Event) {
		cashuTokenInput = (e.target as HTMLTextAreaElement).value;
		cashuError = '';
		cashuDecodedToken = null;
		cashuState = 'idle';
	}

	async function handlePasteToken() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				cashuTokenInput = text;
				validateToken();
			}
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		}
	}

	function validateToken() {
		cashuError = '';
		cashuDecodedToken = null;

		if (!cashuTokenInput.trim()) {
			cashuError = $_('screen.receive.token_required');
			cashuState = 'error';
			return;
		}

		cashuState = 'validating';

		try {
			if (!isCashuToken(cashuTokenInput.trim())) {
				cashuError = $_('screen.receive.error_invalid_token');
				cashuState = 'error';
				return;
			}

			const decoded = decodeToken(cashuTokenInput.trim());
			const amount = getTokenAmount(decoded);

			cashuDecodedToken = {
				amount,
				mint: decoded.mint,
				proofCount: decoded.proofs.length
			};
			cashuState = 'preview';
		} catch (e) {
			cashuError = e instanceof Error ? e.message : $_('screen.receive.error_invalid_token');
			cashuState = 'error';
		}
	}

	async function handleReceiveToken() {
		if (!cashuDecodedToken) return;

		cashuState = 'loading';
		cashuError = '';

		try {
			const result = await receiveTokens(cashuTokenInput.trim());
			cashuReceiveResult = result;
			cashuState = 'success';
			showToast($_('screen.receive.token_received'), 'success');
		} catch (e) {
			// TASK-092 (F-061): Wallet lock fallback — show unlock prompt + retry
			if (e instanceof WalletLockedError) {
				cashuState = 'idle';
				unlockPendingOp = () => handleReceiveToken();
				showUnlockPrompt = true;
				return;
			}
			cashuError = e instanceof Error ? e.message : $_('screen.receive.error_receive_token');
			cashuState = 'error';
			showToast(cashuError, 'error');
		}
	}

	function resetCashu() {
		cashuState = 'idle';
		cashuTokenInput = '';
		cashuDecodedToken = null;
		cashuError = '';
		cashuReceiveResult = null;
	}

	function handleOkAndNavigateCashu() {
		resetCashu();
		navigateTo('home');
	}

	function handleBack() {
		navigateTo('home');
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}
</script>

<div class="receive-screen" role="main" aria-label={$_('screen.receive.title')}>

	<!-- Header -->
	<div class="screen-header">
		<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<Heading level="h2">{$_('screen.receive.title')}</Heading>
		<div class="header-spacer"></div>
	</div>

	<!-- Tabs -->
	<div class="tab-bar" role="tablist">
		<button
			type="button"
			role="tab"
			class="tab-btn"
			class:tab-active={activeTab === 'lightning'}
			aria-selected={activeTab === 'lightning'}
			onclick={() => activeTab = 'lightning'}
		>
			<Iconly name="Lightning" size={18} /> {$_('screen.receive.tab_lightning')}
		</button>
		<button
			type="button"
			role="tab"
			class="tab-btn"
			class:tab-active={activeTab === 'cashu'}
			aria-selected={activeTab === 'cashu'}
			onclick={() => activeTab = 'cashu'}
		>
			<Iconly name="Banknote" size={18} /> {$_('screen.receive.tab_cashu')}
		</button>
	</div>

	<!-- ══════════════════ LIGHTNING TAB ══════════════════ -->
	{#if activeTab === 'lightning'}
		<div class="tab-content" role="tabpanel">
			{#if lightningState === 'idle' || lightningState === 'error'}
				<Card variant="basic" padding="lg">
					<div class="amount-section">
						<Body size="sm" color="secondary">{$_('screen.receive.amount_label')}</Body>
						<div class="amount-display" aria-live="polite">
							<span class="amount-value">{lightningAmount === '0' ? '0' : lightningAmount}</span>
							<span class="amount-unit">{$_('screen.balance.sats')}</span>
						</div>
					</div>
				</Card>

				<Numpad
					value={lightningAmount}
					onchange={handleLightningAmountChange}
					onconfirm={handleCreateInvoice}
					confirmLabel={$_('screen.receive.create_invoice')}
					disabled={isLightningDisabled()}
				/>

				{#if lightningState === 'error' && lightningError}
					<div class="error-banner" role="alert">
						<Body size="sm">{lightningError}</Body>
						<button type="button" class="error-close" onclick={() => lightningState = 'idle'} aria-label="Dismiss">
							<Close size={16} />
						</button>
					</div>
				{/if}
			{/if}

			{#if lightningState === 'loading'}
				<div class="loading-section">
					<div class="spinner-lg"></div>
					<Body size="md" color="secondary">{$_('screen.receive.creating_invoice')}</Body>
				</div>
			{/if}

			{#if lightningState === 'invoice' || lightningState === 'polling'}
				<Card variant="basic" padding="lg">
					<div class="invoice-section">
						<Heading level="h3">{$_('screen.receive.lightning_invoice')}</Heading>
						<QRDisplay data={lightningQrData} size={300} />
						<div class="invoice-text">
							<Body size="sm" color="secondary">
								{lightningInvoice.substring(0, 40)}...
							</Body>
						</div>
						<div class="invoice-actions">
							<Button variant="secondary" size="sm" onclick={handleCopyInvoice}>
								{#snippet children()}<Copy size={14} /> {$_('common.copy')}{/snippet}
							</Button>
						</div>
					</div>
				</Card>

				{#if lightningState === 'polling'}
					<div class="polling-section">
						<div class="polling-indicator">
							<span class="pulse-dot" aria-hidden="true"></span>
							<Body size="sm" color="secondary">{$_('screen.receive.waiting_payment')}</Body>
						</div>
						<div class="polling-dots">
							{#each Array(3) as _, i}
								<span class="poll-dot" class:poll-dot-active={pollCount % 4 > i}></span>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			{#if lightningState === 'success'}
				<Card variant="basic" padding="lg">
					<div class="success-section" data-flow="receive-lightning">
						<span class="success-icon" aria-hidden="true">
							<Check size={64} />
						</span>
						<Heading level="h3" align="center">{$_('screen.receive.success_title')}</Heading>
						<div class="received-amount">
							<span class="received-value" aria-live="polite">{formatSat(displayBalance)}</span>
							<span class="received-unit">{$_('screen.balance.sats')}</span>
						</div>
						<Body size="sm" color="secondary">
							{$_('screen.receive.amount_received_sat', { values: { amount: formatSat(displayBalance) } })}
						</Body>
						<div class="success-rows" role="list" aria-label={$_('screen.receive.success_title')}>
							<!-- Row 1: Amount (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_amount_label')}</Body>
								<Body size="sm" weight="semibold">
									{formatSat(displayBalance)} {$_('screen.balance.sats')}
								</Body>
							</div>
							<!-- Row 2: Mint (always shown — using default mint url) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_mint_label')}</Body>
								<Body size="sm" weight="semibold" truncate>{mintUrl}</Body>
							</div>
							<!-- Row 3: Time (always shown) — NO preimage per MOD-013 correction -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_time_label')}</Body>
								<Body size="sm" weight="semibold">
									<Time size={14} />
									<span>{new Date().toLocaleTimeString()}</span>
								</Body>
							</div>
						</div>
						<button type="button" class="success-cta" onclick={handleOkAndNavigateLightning}>
							{$_('common.ok')}
						</button>
					</div>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- ══════════════════ CASHU TAB ═══════════════════════ -->
	{#if activeTab === 'cashu'}
		<div class="tab-content" role="tabpanel">
			{#if cashuState === 'idle' || cashuState === 'error' || cashuState === 'validating'}
				<Card variant="basic" padding="lg">
					<div class="paste-input-section">
						<Heading level="h3">{$_('screen.receive.paste_token')}</Heading>
						<textarea
							class="paste-textarea"
							value={cashuTokenInput}
							oninput={handleCashuInput}
						placeholder={$_('screen.receive.token_placeholder')}
						rows={5}
						disabled={cashuState === 'validating'}
							aria-label={$_('screen.receive.paste_token')}
						></textarea>
						<div class="paste-input-actions">
							<Button variant="ghost" size="sm" onclick={handlePasteToken} disabled={cashuState === 'validating'}>
								{#snippet children()}{$_('common.paste')}{/snippet}
							</Button>
							<!-- ITER-5 follow-up: scan button now opens the GLOBAL
							     FullScreenScanOverlay via the `onQRScan` prop wired
							     by App.svelte — same path Home + Send use. The local
							     Modal + scannerOpen state were removed in the
							     3-phase fast-lane fix to make scanner UI standard
							     across all 3 callers. -->
							{#if onQRScan}
								<Button
									variant="ghost"
									size="sm"
									onclick={onQRScan}
									disabled={cashuState === 'validating'}
								>
									{#snippet children()}<Iconly name="Scan" size={12} /><span>{$_('common.scan_qr')}</span>{/snippet}
								</Button>
							{/if}
						</div>
						<!-- ITER-5: Validate moved to its own row below .paste-input-actions
						     to align with Send.svelte primary-CTA layout (separate row,
						     size md). Hidden during validating to avoid a standalone "..."
						     button row — caller shows progress via cashuState banner instead. -->
						{#if cashuState !== 'validating'}
							<Button
								variant="primary"
								size="md"
								onclick={validateToken}
								disabled={!cashuTokenInput.trim()}
							>
								{#snippet children()}
									{$_('screen.receive.validate_token')}
								{/snippet}
							</Button>
						{/if}
					</div>
				</Card>

				{#if cashuState === 'error' && cashuError}
					<div class="error-banner" role="alert">
						<Body size="sm">{cashuError}</Body>
						<button type="button" class="error-close" onclick={() => cashuState = 'idle'} aria-label="Dismiss">
							<Close size={16} />
						</button>
					</div>
				{/if}
			{/if}

			{#if cashuState === 'preview' && cashuDecodedToken}
				<Card variant="basic" padding="lg">
					<div class="preview-section">
						<Heading level="h3">{$_('screen.receive.token_preview')}</Heading>
						<div class="preview-details">
							<div class="detail-row">
								<Body size="sm" color="secondary">{$_('screen.receive.token_amount')}</Body>
								<Body size="sm" weight="semibold">{formatSat(cashuDecodedToken.amount)} {$_('screen.balance.sats')}</Body>
							</div>
							<div class="detail-row">
								<Body size="sm" color="secondary">{$_('screen.send.mint_url_label')}</Body>
								<Body size="sm" weight="semibold" truncate>{cashuDecodedToken.mint}</Body>
							</div>
							<div class="detail-row">
								<Body size="sm" color="secondary">{$_('screen.receive.proof_count')}</Body>
								<Body size="sm" weight="semibold">{cashuDecodedToken.proofCount}</Body>
							</div>
						</div>
						<div class="preview-actions">
							<Button variant="secondary" size="md" onclick={resetCashu}>
								{#snippet children()}{$_('common.cancel')}{/snippet}
							</Button>
							<Button variant="primary" size="md" onclick={handleReceiveToken}>
								{#snippet children()}{$_('screen.receive.receive_token')}{/snippet}
							</Button>
						</div>
					</div>
				</Card>
			{/if}

			{#if cashuState === 'loading'}
				<div class="loading-section">
					<div class="spinner-lg"></div>
					<Body size="md" color="secondary">{$_('screen.receive.receiving_token')}</Body>
				</div>
			{/if}

			{#if cashuState === 'success' && cashuReceiveResult}
				<Card variant="basic" padding="lg">
					<div class="success-section" data-flow="receive-cashu">
						<span class="success-icon" aria-hidden="true">
							<Check size={64} />
						</span>
						<Heading level="h3" align="center">{$_('screen.receive.success_title')}</Heading>
						<div class="received-amount">
							<span class="received-value">{formatSat(cashuReceiveResult.amount)}</span>
							<span class="received-unit">{$_('screen.balance.sats')}</span>
						</div>
						<div class="success-rows" role="list" aria-label={$_('screen.receive.success_title')}>
							<!-- Row 1: Amount (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_amount_label')}</Body>
								<Body size="sm" weight="semibold">
									{formatSat(cashuReceiveResult.amount)} {$_('screen.balance.sats')}
								</Body>
							</div>
							<!-- Row 2: Mint (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_mint_label')}</Body>
								<Body size="sm" weight="semibold" truncate>{cashuReceiveResult.mint}</Body>
							</div>
							<!-- Row 3: Proofs (conditional — only if proofCount > 0) -->
							{#if cashuReceiveResult.proofCount > 0}
								<div class="success-row" role="listitem">
									<Body size="sm" color="secondary">{$_('screen.receive.success_proofs_label')}</Body>
									<Body size="sm" weight="semibold">{cashuReceiveResult.proofCount}</Body>
								</div>
							{/if}
							<!-- Row 4: DLEQ (conditional — only if dleqCount > 0) -->
							{#if cashuReceiveResult.dleqCount !== undefined && cashuReceiveResult.dleqCount > 0}
								<div class="success-row" role="listitem">
									<Body size="sm" color="secondary">{$_('screen.receive.success_dleq_label')}</Body>
									<Body size="sm" weight="semibold">{cashuReceiveResult.dleqCount}</Body>
								</div>
							{/if}
							<!-- Row 5: Time (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.receive.success_time_label')}</Body>
								<Body size="sm" weight="semibold">
									<Time size={14} />
									<span>{new Date().toLocaleTimeString()}</span>
								</Body>
							</div>
						</div>
						<button type="button" class="success-cta" onclick={handleOkAndNavigateCashu}>
							{$_('common.ok')}
						</button>
					</div>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- TASK-092 (F-061): Unlock Prompt — shown when wallet lock detected -->
	<UnlockPrompt
		open={showUnlockPrompt}
		onunlock={handleUnlockSuccess}
		oncancel={handleUnlockCancel}
	/>

	<!-- Toast -->
	<div class="toast-container">
		<Toast
			message={toastMessage}
			type={toastType}
			visible={toastVisible}
			onclose={() => toastVisible = false}
		/>
	</div>

	<div class="bottom-spacer"></div>
</div>

<style>
	.receive-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* ─── Header ──────────────────────── */
	.screen-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.back-btn:hover { background: var(--color-border); }

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.header-spacer { width: 44px; }

	/* ─── Tabs ────────────────────────── */
	.tab-bar {
		display: flex;
		gap: 0;
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		padding: 3px;
	}

	.tab-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: all var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
	}

	/* TASK-F-NEW-010: Active tab now uses a soft cyan background tint
	   (rgba 0,188,212 @ 12%) to mark the active state, instead of the
	   2px cyan bottom border from F-NEW-009. Text remains cyan, the
	   Iconly SVG inside inherits currentColor → automatically cyan too.
	   Dark theme variant uses a slightly stronger cyan 400 tint (18%). */
	.tab-active {
		background: rgba(0, 188, 212, 0.12);
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
		box-shadow: var(--shadow-sm);
	}

	:global([data-theme='dark']) .tab-active {
		background: rgba(38, 198, 218, 0.18);
		color: var(--color-primary);   /* Cyan 400 on dark */
	}

	.tab-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* ─── Amount Display ──────────────── */
	.amount-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}

	.amount-display {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.amount-value {
		font-family: var(--font-family);
		/* TASK-307 (HOT-FIX): 3xl (32px) → 48px. No --font-size-4xl token
		   exists in tokens.css, so use direct 48px (do NOT modify tokens.css). */
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		min-width: 1ch;
		text-align: center;
	}

	.amount-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	/* ─── Invoice Section ─────────────── */
	.invoice-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	.invoice-text {
		font-family: var(--font-family-mono);
		word-break: break-all;
		text-align: center;
		padding: var(--space-sm);
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.invoice-actions {
		display: flex;
		gap: var(--space-sm);
	}

	/* ─── Loading ─────────────────────── */
	.loading-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		padding: var(--space-xl);
		min-height: 200px;
	}

	.spinner-lg {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ─── Polling ─────────────────────── */
	.polling-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
	}

	.polling-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.pulse-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-primary);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.5); opacity: 0.5; }
	}

	.polling-dots {
		display: flex;
		gap: var(--space-xs);
	}

	.poll-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-border);
		transition: background var(--transition-fast);
	}

	.poll-dot-active {
		background: var(--color-primary);
	}

	/* ─── Success ─────────────────────── */
	.success-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	/* TASK-169 / MOD-013: Spacing-only success rows (no borders, gap-based dividers) */
	.success-rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) 0;
	}

	.success-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
	}

	.success-row :global(svg) {
		vertical-align: middle;
		flex-shrink: 0;
	}

	.success-icon {
		color: var(--color-primary);
		animation: check-pop 0.5s ease-out;
	}

	@keyframes check-pop {
		0% { transform: scale(0); opacity: 0; }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
	}

	.received-amount {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.received-value {
		font-family: var(--font-family);
		/* TASK-307 (HOT-FIX): 2xl (24px) → 48px (success screens). Direct 48px. */
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
	}

	.received-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	/* ─── Success CTA (Brand Cyan — F-V18-004) ─ */
	.success-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		cursor: pointer;
		transition: all var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 35%, transparent);
		min-height: 48px;
	}

	.success-cta:hover:not(:disabled) {
		background: var(--color-primary-hover);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 40%, transparent);
	}

	.success-cta:active:not(:disabled) {
		transform: scale(0.97);
	}

	.success-cta:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* ─── Paste Input (ITER-5: unified with Send.invoice-input-section) ─── */
	.paste-input-section {
		display: flex;
		flex-direction: column;
		/* ITER-5: tighter vertical gap 2px (Commander feedback). */
		gap: 2px;
	}

	.paste-textarea {
		width: 100%;
		margin-top: var(--space-sm);
		padding: var(--space-md);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: var(--color-surface);
		resize: vertical;
		line-height: var(--line-height-normal);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	/* TASK-F-NEW-009: paste textarea focus — Cyan border + cyan halo (light theme).
	   Matches Send.svelte .paste-textarea:focus pattern from F-NEW-008. */
	.paste-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.12);
	}

	/* TASK-F-NEW-009: Dark-theme focus halo — uses brighter cyan 400 (#26c6da) + slightly stronger alpha
	   Required :global() wrapper so vite-plugin-svelte does not tree-shake the dark variant. */
	:global([data-theme='dark']) .paste-textarea:focus {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(38, 198, 218, 0.18);
	}

	.paste-textarea:disabled {
		background: var(--color-surface-variant);
		opacity: 0.7;
	}

	.paste-input-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
	}

	/* ─── Preview ─────────────────────── */
	.preview-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* TASK-F-NEW-009: Cashu token amount (preview section, first row) — Cyan highlight.
	   Target via :global() to reach the Body child component's <p data-weight="semibold"> element.
	   Receive.svelte's .preview-section holds the Cashu token preview (amount/mint/proofs). */
	.preview-section .detail-row:first-child :global([data-weight='semibold']) {
		color: var(--color-primary);
		font-weight: var(--font-weight-bold);
	}

	.preview-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.preview-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
	}

	/* ─── Error banner moved to src/app.css (global) per ITER-5 ─── */

	/* ─── Toast ───────────────────────── */
	.toast-container {
		position: fixed;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-toast);
		max-width: 360px;
		width: calc(100% - 2 * var(--space-md));
	}

	.bottom-spacer {
		height: calc(80px + env(safe-area-inset-bottom, 0px));
	}
</style>
