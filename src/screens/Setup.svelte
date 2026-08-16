<script lang="ts">
	/**
	 * Setup Screen — multi-step wallet setup wizard (TASK-207 / D1, D1.1, D2, D3
	 * + TASK-208 / D3, D4).
	 *
	 * Flow:
	 *   Welcome (create/recover + language toggle)
	 *     → Seed (create: 12-word SeedGrid + paper-only ack | recover: BIP39 autocomplete import)
	 *     → Verify (create only: random 3-word quiz — TASK-208 D4)
	 *     → PIN (4-digit sharded keypad + OWASP lockout — TASK-209, PRESERVED)
	 *     → Done (PWA manual install nudge; recover shows NUT-9 restore status)
	 *
	 * Existing wallet → skips straight to PIN entry (unlock).
	 *
	 * ⚠️ TASK-209 (D5) PIN work is preserved verbatim: 4-digit PIN, randomized
	 * Keypad, PinDots, lockout rate-limit, encrypted attempt counter, and the
	 * input-mode fallback. See the "─── PIN (TASK-209, preserved) ───" sections.
	 */
	import { onDestroy } from 'svelte';
	import { _, locale } from 'svelte-i18n';
	import {
		unlockWallet,
		getWalletStatus,
		storeSessionPin,
		getSessionPin,
		type WalletState
	} from '$lib/wallet/state';
	import { importSeed, seedToPrivateKey } from '$lib/wallet/seed';
	import { generateMnemonic } from '$lib/wallet/keys';
	import { InvalidPinError, WalletNotInitializedError } from '$lib/wallet/errors';
	import { setActiveMintUrl } from '$lib/wallet/store';
	import { DEFAULT_MINT_CONFIG } from '$lib/wallet/config';
	import { getSettings, setSettings } from '$lib/storage/local';
	// TASK-220: "forgot PIN" → seed recovery via #/setup?recover=1
	import { getHashParam } from '$lib/router';

	// TASK-208 (D3/D4): dedicated recovery phrase backup flow
	import { WORDLIST } from '$lib/wallet/wordlist';
	import { restoreWallet } from '$lib/wallet/restore';
	import { setActiveSeed, seedFromMnemonic } from '$lib/wallet/nut13';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
	import { rekeyWallet, getRekeyJournal } from '$lib/wallet/rekey';
	import SeedGrid from '$lib/components/SeedGrid.svelte';
	import SeedVerifyQuiz from '$lib/components/SeedVerifyQuiz.svelte';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';

	// TASK-207 (D1): wizard progress stepper
	import ProgressStepper, { type StepperStep } from '$lib/components/ProgressStepper.svelte';

	// TASK-209 (D5): 4-digit sharded PIN entry + OWASP lockout
	import Keypad from '$lib/components/Keypad.svelte';
	import PinDots from '$lib/components/PinDots.svelte';
	import {
		getLockoutStatus,
		recordFailure,
		recordSuccess,
		resetLockout,
		MAX_ATTEMPTS,
		type LockoutStatus
	} from '$lib/wallet/lockout';

	interface Props {
		onWalletReady?: (state: WalletState) => void;
	}

	let { onWalletReady }: Props = $props();

	// ─── Wizard model ─────────────────────────────────────────
	type SetupMode = 'create' | 'recover' | 'unlock';
	type WizardStep =
		| 'welcome'
		| 'seed'
		| 'verify'
		| 'mints'
		| 'pin'
		| 'restoring'
		| 'rekey'
		| 'done';
	type PinEntryMode = 'keypad' | 'input';

	const CREATE_STEPS: WizardStep[] = ['welcome', 'seed', 'verify', 'pin', 'done'];
	const RECOVER_STEPS: WizardStep[] = [
		'welcome',
		'seed',
		'mints',
		'pin',
		'restoring',
		'rekey',
		'done'
	];

	// TASK-209 (D5): PIN is 4 digits (was 6)
	const PIN_LENGTH = 4;
	const DEFAULT_WALLET_NAME = 'LNWCASH Wallet';

	let mode: SetupMode = $state('create');
	let step: WizardStep = $state('welcome');
	let currentLang: string = $state('en');
	// TASK-220: PIN keypad shuffle setting (persisted, default off).
	let pinShuffle: boolean = $state(false);

	// Seed phrase (create: generated; recover: entered)
	let seed: string = $state('');
	let seedError: string = $state('');

	// TASK-208 (D3): recover seed entered as 12 individual words (per-word autocomplete).
	const RECOVER_WORD_COUNT = 12;
	function emptyRecoverWords(): string[] {
		return Array.from({ length: RECOVER_WORD_COUNT }, () => '');
	}
	let recoverWords: string[] = $state(emptyRecoverWords());
	let activeWordIndex: number = $state(-1); // index of the focused word box (-1 = none)

	// TASK-208 (D3): paper-only ack — user must confirm writing phrase on paper
	let seedAckChecked: boolean = $state(false);

	// TASK-208: restore funds (NUT-9) status after recover finalize
	type RestoreStatus = 'idle' | 'running' | 'done' | 'error';
	let restoreStatus: RestoreStatus = $state('idle');
	let restoredProofs: number = $state(0);
	// TASK-217: per-mint restore progress (which mint is being restored)
	let restoreProgress: string = $state('');
	// Cached BIP39 seed bytes — reused by the "retry" action on the blocking
	// 'restoring' step (seed state is cleared at finalization for security).
	let restoreSeedBytes: Uint8Array | null = null;

	// TASK-259: mint selection (recover wizard) — mints to scan for proofs.
	let selectedMints: string[] = $state([]);
	let customMintUrl: string = $state('');
	let mintError: string = $state('');

	// TASK-259: re-key step (recover wizard) — new seed + swap.
	type RekeyPhase = 'seed' | 'verify' | 'running' | 'error';
	let rekeyMnemonic: string = $state('');
	let rekeyPhase: RekeyPhase = $state('seed');
	let rekeyAckChecked: boolean = $state(false);
	let rekeySkipWarning: boolean = $state(false);
	let rekeyError: string = $state('');
	// TASK-259 (resume, T262-A3): a pending (interrupted) re-key is detected at
	// startup so the wizard can re-offer resume instead of a fresh re-key.
	let pendingRekeyDetected: boolean = $state(false);

	// PIN state (TASK-209 preserved)
	let pin: string = $state('');
	let confirmPin: string = $state('');
	let error: string = $state('');
	let loading: boolean = $state(false);

	// TASK-209 (D5): sharded entry + lockout state
	let pinEntryMode: PinEntryMode = $state('keypad');
	let registerPhase: 'enter' | 'confirm' = $state('enter');
	let shakeKey: number = $state(0);
	let attemptKey: number = $state(0);
	let lockout: LockoutStatus = $state(emptyLockout());
	let lockNow: number = $state(Date.now());

	// ─── Derived navigation ──────────────────────────────────
	const wizardSteps = $derived((mode as SetupMode) === 'recover' ? RECOVER_STEPS : CREATE_STEPS);
	const stepIndex = $derived(Math.max(0, wizardSteps.indexOf(step)));
	const isUnlock = $derived((mode as SetupMode) === 'unlock');

	// 'restoring' and 'rekey' are transient processing steps, not user steps —
	// hide them from the numbered stepper (recover flow still shows
	// welcome/seed/mints/pin/done).
	const stepperSteps: StepperStep[] = $derived(
		wizardSteps
			.filter((s) => s !== 'restoring' && s !== 'rekey')
			.map((s) => ({
				id: s,
				label: $_('screen.setup.step_label_' + s)
			}))
	);

	// TASK-208: whether the "next" control is allowed at the current step.
	// Create seed step is gated on the paper-only checkbox (D3); recover seed
	// stays enabled (validated on click); the mint-selection step requires at
	// least one mint; PIN requires a full 4-digit pair.
	const canContinue = $derived(
		(step as WizardStep) === 'pin'
			? pin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH
			: (step as WizardStep) === 'seed' && mode === 'create'
				? seedAckChecked
				: (step as WizardStep) === 'mints'
					? selectedMints.length > 0
					: true
	);

	// TASK-208: normalized phrase words (used by SeedGrid + SeedVerifyQuiz).
	const seedWords = $derived(seed.trim().split(/\s+/).filter(Boolean));

	// TASK-259: normalized new re-key phrase words (SeedGrid + verify quiz).
	const rekeyWords = $derived(rekeyMnemonic.trim().split(/\s+/).filter(Boolean));

	// TASK-208: canonical space-separated recover phrase, derived from the 12
	// individual word boxes (used for validation + finalize; crypto API unchanged).
	const seedInput = $derived(recoverWords.map((w) => w.trim()).join(' '));

	// TASK-208: per-box autocomplete — the word currently being typed in the
	// focused box, and the matching BIP39 suggestions from the 2048-word list.
	const activeWordFragment = $derived(
		activeWordIndex >= 0 && activeWordIndex < RECOVER_WORD_COUNT
			? (recoverWords[activeWordIndex] ?? '').trim()
			: ''
	);

	const seedSuggestions = $derived(
		activeWordIndex >= 0 && activeWordFragment.length >= 1
			? WORDLIST.filter(
					(w) =>
						w.startsWith(activeWordFragment.toLowerCase()) &&
						w !== activeWordFragment.toLowerCase()
				).slice(0, 8)
			: []
	);

	// ─── Mount: detect existing wallet + resume + language ────
	$effect(() => {
		// Language + PIN-shuffle preference from persisted settings
		try {
			const settings = getSettings();
			currentLang = settings.language || 'en';
			locale.set(currentLang);
			pinShuffle = settings.pin_shuffle ?? false;
		} catch {
			currentLang = 'en';
			pinShuffle = false;
		}

		// TASK-220: "forgot PIN" → jump straight into seed recovery
		// (recover mode + seed step), bypassing the unlock shortcut.
		if (getHashParam('recover') === '1') {
			mode = 'recover';
			step = 'seed';
			seed = '';
			recoverWords = emptyRecoverWords();
			seedError = '';
			return;
		}

		// Existing wallet → skip straight to PIN unlock
		try {
			const status = getWalletStatus();
			if (status.state !== 'UNINITIALIZED') {
				mode = 'unlock';
				step = 'pin';
				return;
			}
		} catch {
			// UNINITIALIZED — continue to welcome/resume
		}

		// sessionStorage resume (TASK-207: resume + exit warning)
		const resumed = loadWizard();
		if (resumed) {
			mode = resumed.mode === 'recover' ? 'recover' : 'create';
			step = resumed.step;
			if (resumed.seed) seed = resumed.seed;
		}
	});

	// TASK-259 (resume, T262-A3): detect a pending (interrupted) re-key at
	// startup so the wizard can re-offer resume (via NUT-13 restore from the
	// NEW seed held in the journal). The journal is only written by rekeyWallet
	// and cleared on a successful (or zero-success) re-key, so its presence here
	// means a re-key was interrupted mid-swap.
	$effect(() => {
		pendingRekeyDetected = getRekeyJournal() !== null;
	});

	// TASK-209: load persisted lockout on mount.
	$effect(() => {
		getLockoutStatus().then((s) => {
			lockout = s;
		});
	});

	// TASK-209: countdown tick while locked.
	$effect(() => {
		if (!lockout.locked) return;
		const id = setInterval(() => {
			lockNow = Date.now();
			if (lockNow >= lockout.lockUntil) {
				lockout = { ...lockout, locked: false, remainingMs: 0 };
			}
		}, 1000);
		return () => clearInterval(id);
	});

	// TASK-207: persist wizard progress to sessionStorage on every step change.
	$effect(() => {
		persistWizard();
	});

	// TASK-207: exit warning while setup is in progress.
	$effect(() => {
		if (mode === 'unlock' || step === 'welcome' || step === 'done') return;
		function beforeUnload(e: BeforeUnloadEvent) {
			e.preventDefault();
			e.returnValue = '';
		}
		window.addEventListener('beforeunload', beforeUnload);
		return () => window.removeEventListener('beforeunload', beforeUnload);
	});

	// Auto-advance the blocking 'restoring' step once the NUT-9 restore
	// completes → proceed to the automatic re-key step (TASK-259). On error we
	// stay on 'restoring' (user retries or waits).
	$effect(() => {
		if (step === 'restoring' && restoreStatus === 'done') {
			step = 'rekey';
		}
	});

	// TASK-259: enter the re-key step → generate the fresh 12-word mnemonic once.
	$effect(() => {
		if (step === 'rekey' && rekeyMnemonic === '') {
			rekeyMnemonic = generateMnemonic();
			rekeyPhase = 'seed';
			rekeyAckChecked = false;
			rekeySkipWarning = false;
			rekeyError = '';
		}
	});

	// ─── Helpers ─────────────────────────────────────────────
	function clearError() {
		error = '';
	}

	// TASK-208 (D4): clear the seed from component state on unmount so the
	// recovery phrase never lingers in the DOM after the setup screen is gone.
	onDestroy(() => {
		seed = '';
		recoverWords = emptyRecoverWords();
		seedError = '';
		restoreSeedBytes = null;
		rekeyMnemonic = '';
	});

	// ─── TASK-209 (D5): Lockout + sharded entry helpers ───────

	function emptyLockout(): LockoutStatus {
		return {
			attempts: 0,
			maxAttempts: MAX_ATTEMPTS,
			locked: false,
			lockUntil: 0,
			remainingMs: 0,
			level: 'none'
		};
	}

	function formatDuration(ms: number): string {
		const totalSeconds = Math.ceil(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		if (minutes >= 60) {
			const hours = Math.floor(minutes / 60);
			const mins = minutes % 60;
			return `${hours}h ${mins}m`;
		}
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	function lockoutMessage(status: LockoutStatus): string {
		return `Failed too many times — locked. Try again in ${formatDuration(status.remainingMs)}`;
	}

	function resetPinEntry() {
		pin = '';
		confirmPin = '';
		registerPhase = 'enter';
		shakeKey += 1;
		attemptKey += 1; // remount keypad (shake reset; layout now fixed)
	}

	function togglePinMode() {
		clearError();
		pin = '';
		confirmPin = '';
		registerPhase = 'enter';
		pinEntryMode = pinEntryMode === 'keypad' ? 'input' : 'keypad';
	}

	// ─── PIN digit entry (TASK-209 preserved) ────────────────
	function handlePinDigit(digit: string) {
		clearError();
		if (mode === 'unlock') {
			if (pin.length >= PIN_LENGTH) return;
			pin += digit;
			if (pin.length === PIN_LENGTH) void handleUnlock();
			return;
		}
		// register
		if (registerPhase === 'enter') {
			if (pin.length >= PIN_LENGTH) return;
			pin += digit;
			if (pin.length === PIN_LENGTH) registerPhase = 'confirm';
		} else {
			if (confirmPin.length >= PIN_LENGTH) return;
			confirmPin += digit;
			if (confirmPin.length === PIN_LENGTH) void handleRegister();
		}
	}

	function handlePinBackspace() {
		clearError();
		if (mode === 'unlock') {
			pin = pin.slice(0, -1);
			return;
		}
		if (registerPhase === 'confirm') {
			confirmPin = confirmPin.slice(0, -1);
			if (confirmPin.length === 0) registerPhase = 'enter';
		} else {
			pin = pin.slice(0, -1);
		}
	}

	// ─── PIN Registration → finalize wallet (TASK-207) ───────
	async function handleRegister() {
		clearError();
		if (pin.length < PIN_LENGTH) {
			error = $_('screen.register.error_too_short');
			return;
		}
		if (pin !== confirmPin) {
			error = $_('screen.register.error_mismatch');
			// TASK-209 (D5): mismatch → reset + shake
			resetPinEntry();
			return;
		}

		loading = true;
		try {
			// TASK-092 (F-061): Store PIN in sessionStorage for auto-unlock on refresh
			storeSessionPin(pin);
			// TASK-207: create/recover wallet from the seed (TASK-205 API)
			await importSeed(seed, pin, DEFAULT_WALLET_NAME);
			// TASK-209 (D5): fresh wallet → clear any stale lockout
			await resetLockout();
			// F-067: activate default mint so Receive/Send pick it up
			setActiveMintUrl(DEFAULT_MINT_CONFIG.url);
			// TASK-208: activate NUT-13 deterministic seed + trigger NUT-9 restore
			activateSeedAndRestore();
			// Unlock immediately
			await unlockWallet(pin);
			clearWizard();
			// Recover blocks on the 'restoring' step until the NUT-9 fund restore
			// completes (user must not leave while restore is running); create
			// goes straight to 'done'.
			step = mode === 'recover' ? 'restoring' : 'done';
			// TASK-208 (D4): clear phrase from memory once wallet is finalized
			seed = '';
			recoverWords = emptyRecoverWords();
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	// ─── PIN Unlock (existing wallet, TASK-209 preserved) ────
	async function handleUnlock() {
		clearError();
		if (pin.length < PIN_LENGTH) {
			error = $_('screen.register.error_too_short');
			return;
		}

		// TASK-209 (D5): enforce lockout before attempting
		const current = await getLockoutStatus();
		if (current.locked) {
			lockout = current;
			lockNow = Date.now();
			error = lockoutMessage(current);
			pin = '';
			shakeKey += 1;
			return;
		}

		loading = true;
		try {
			const result = await unlockWallet(pin);
			// TASK-092 (F-061): Store PIN in sessionStorage for auto-unlock on refresh
			await recordSuccess();
			lockout = emptyLockout();
			storeSessionPin(pin);
			onWalletReady?.(result);
		} catch (e) {
			if (e instanceof InvalidPinError) {
				lockout = await recordFailure();
				lockNow = Date.now();
				pin = '';
				shakeKey += 1;
				attemptKey += 1;
				error = lockout.locked ? lockoutMessage(lockout) : e.message;
			} else if (e instanceof WalletNotInitializedError) {
				error = e.message;
			} else if (e instanceof Error) {
				error = e.message;
			} else {
				error = $_('common.error');
			}
		} finally {
			loading = false;
		}
	}

	// ─── Wizard navigation (TASK-207) ────────────────────────
	function chooseCreate() {
		clearError();
		mode = 'create';
		seed = generateMnemonic();
		recoverWords = emptyRecoverWords();
		seedError = '';
		restoreSeedBytes = null;
		step = 'seed';
	}

	function chooseRecover() {
		clearError();
		mode = 'recover';
		seed = '';
		recoverWords = emptyRecoverWords();
		seedError = '';
		restoreSeedBytes = null;
		// TASK-259: default mint selection (mint.lnw.cash) for the recover scan.
		selectedMints = [DEFAULT_MINT_CONFIG.url];
		customMintUrl = '';
		mintError = '';
		step = 'seed';
	}

	function validateRecoverSeed(input: string): boolean {
		const trimmed = input.trim();
		if (!trimmed) return false;
		try {
			seedToPrivateKey(trimmed);
			return true;
		} catch {
			return false;
		}
	}

	function continueFromSeed() {
		clearError();
		if (mode === 'create') {
			// TASK-208 (D3): require the paper-only ack before advancing
			if (!seedAckChecked) return;
			seedError = '';
			step = 'verify';
			return;
		}
		// recover — validate entered phrase before proceeding
		if (!validateRecoverSeed(seedInput)) {
			seedError = $_('screen.setup.seed_invalid');
			return;
		}
		seed = seedInput.trim().toLowerCase().replace(/\s+/g, ' ');
		seedError = '';
		// TASK-259: recover → mint selection (before scanning proofs).
		if (selectedMints.length === 0) selectedMints = [DEFAULT_MINT_CONFIG.url];
		customMintUrl = '';
		mintError = '';
		step = 'mints';
	}

	// ─── TASK-259: mint selection (recover wizard) ───────────

	function toggleMint(mintUrl: string) {
		mintError = '';
		if (selectedMints.includes(mintUrl)) {
			selectedMints = selectedMints.filter((m) => m !== mintUrl);
		} else {
			selectedMints = [...selectedMints, mintUrl];
		}
	}

	function addMint() {
		mintError = '';
		const url = customMintUrl.trim().replace(/\/+$/, '');
		if (!url) {
			mintError = $_('common.error_mint_url_required');
			return;
		}
		if (!/^https?:\/\//i.test(url)) {
			mintError = $_('common.error_invalid_url');
			return;
		}
		if (selectedMints.includes(url)) {
			mintError = $_('screen.setup.mints_duplicate');
			return;
		}
		selectedMints = [...selectedMints, url];
		customMintUrl = '';
	}

	function continueFromMints() {
		clearError();
		if (selectedMints.length === 0) {
			mintError = $_('screen.setup.mints_required');
			return;
		}
		mintError = '';
		step = 'pin';
	}

	// TASK-208: focus a specific recover word box (by index).
	function focusRecoverWord(index: number) {
		if (index < 0 || index >= RECOVER_WORD_COUNT) return;
		activeWordIndex = index;
		requestAnimationFrame(() => {
			document.getElementById(`recover-word-${index}`)?.focus();
		});
	}

	// TASK-208: advance focus to the next empty word box after `index`.
	function advanceRecoverWord(index: number) {
		for (let i = index + 1; i < RECOVER_WORD_COUNT; i++) {
			if ((recoverWords[i] ?? '').trim() === '') {
				focusRecoverWord(i);
				return;
			}
		}
		activeWordIndex = -1;
	}

	// TASK-208: handle per-box input (single word, or a pasted multi-word phrase).
	function onRecoverWordInput(index: number, value: string) {
		seedError = '';
		const words = value.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			recoverWords[index] = '';
			activeWordIndex = index;
			return;
		}
		let i = index;
		for (const w of words) {
			if (i >= RECOVER_WORD_COUNT) break;
			recoverWords[i] = w;
			i++;
		}
		activeWordIndex = index;
		if (words.length > 1) advanceRecoverWord(i - 1);
	}

	// TASK-208: keyboard navigation — space/enter completes a word, backspace on
	// an empty box steps back to the previous box.
	function onRecoverWordKeydown(index: number, e: KeyboardEvent) {
		const el = e.target as HTMLInputElement;
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			const val = el.value.trim();
			if (val) {
				recoverWords[index] = val;
				advanceRecoverWord(index);
			}
		} else if (e.key === 'Backspace' && el.value === '') {
			e.preventDefault();
			if (index > 0) {
				focusRecoverWord(index - 1);
				requestAnimationFrame(() => {
					const prev = document.getElementById(
						`recover-word-${index - 1}`
					) as HTMLInputElement | null;
					prev?.select();
				});
			}
		}
	}

	// TASK-208: complete the active word from an autocomplete suggestion.
	function completeSeedWord(index: number, word: string) {
		recoverWords[index] = word;
		seedError = '';
		advanceRecoverWord(index);
	}

	// TASK-208: verify quiz completion (create flow).
	function onVerifyComplete(passed: boolean) {
		if (passed) {
			step = 'pin';
		}
	}

	// TASK-208: activate the deterministic seed + (recover) restore funds via NUT-9.
	function activateSeedAndRestore() {
		const mnemonic = seed.trim();
		let seedBytes: Uint8Array;
		try {
			seedBytes = seedFromMnemonic(mnemonic);
			setActiveSeed(seedBytes);
		} catch {
			return;
		}
		restoreSeedBytes = seedBytes;
		if (mode === 'recover') {
			void restoreFunds(seedBytes);
		}
	}

	async function restoreFunds(seedBytes: Uint8Array) {
		restoreStatus = 'running';
		restoredProofs = 0;
		restoreProgress = '';
		try {
			// TASK-259: restore across the USER-SELECTED mints (mint selection step),
			// not all configured mints. Each selected mint is scanned for proofs.
			const mints = selectedMints;
			let total = 0;
			for (let i = 0; i < mints.length; i++) {
				const mintUrl = mints[i].replace(/\/+$/, '');
				// Per-mint progress (honest status): show which mint is being restored.
				restoreProgress = `${i + 1}/${mints.length}: ${mintUrl}`;
				const keysets = await fetchAndCacheKeysets(mintUrl);
				const active = keysets.filter((k) => k.active);
				for (const ks of active) {
					const res = await restoreWallet(mintUrl, seedBytes, ks.id, {});
					if (res.success) total += res.proofs.length;
				}
				restoredProofs = total;
			}
			restoreStatus = 'done';
			restoreProgress = '';
		} catch {
			restoreStatus = 'error';
			restoreProgress = '';
		}
	}

	function goBack() {
		clearError();
		// Block back navigation while the NUT-9 restore is running and during the
		// re-key step — the user must finish re-key (or explicitly skip).
		if (step === 'restoring' || step === 'rekey') return;
		const idx = stepIndex;
		if (idx > 0) {
			step = wizardSteps[idx - 1];
			seedError = '';
		}
	}

	function startUsingWallet() {
		onWalletReady?.(getWalletStatus());
	}

	// Retry the NUT-9 restore from the blocking 'restoring' step (recover flow).
	// Reuses the cached seed bytes (the seed string itself is already cleared).
	function retryRestore() {
		if (restoreSeedBytes) {
			void restoreFunds(restoreSeedBytes);
		}
	}

	// ─── TASK-259: re-key (new seed + atomic swap) ───────────

	// Verify quiz (re-key) completion → run the atomic swap.
	function onRekeyVerifyComplete(passed: boolean) {
		if (passed) {
			void runRekey();
		}
	}

	async function runRekey() {
		rekeyError = '';
		rekeyPhase = 'running';
		try {
			// The PIN was just set during this recover flow (storeSessionPin was
			// called in handleRegister). rekeyWallet uses it only to encrypt the
			// NEW mnemonic — no re-verification needed (user already confirmed
			// via SeedGrid + paper ack + verify quiz).
			const pinForRekey = getSessionPin() ?? pin;
			await rekeyWallet(rekeyMnemonic, pinForRekey, { mints: selectedMints });
			rekeyMnemonic = '';
			step = 'done';
		} catch (e) {
			rekeyPhase = 'error';
			rekeyError = e instanceof Error ? e.message : $_('common.error');
		}
	}

	// Skip re-key — REQUIRES explicit confirmation (strong "seed compromised"
	// warning). There is NO silent auto-skip: default is to re-key.
	function requestSkipRekey() {
		rekeySkipWarning = true;
	}

	function cancelSkipRekey() {
		rekeySkipWarning = false;
	}

	function confirmSkipRekey() {
		// User explicitly chose to keep the (possibly compromised) old seed.
		rekeySkipWarning = false;
		rekeyMnemonic = '';
		step = 'done';
	}

	// TASK-259 (resume, T262-A3): route into the recover flow so the user can
	// resume an interrupted re-key via NUT-13 restore from the NEW seed (the
	// journal's recovery anchor). This is the SAFE resume — it never re-runs the
	// swap over already-committed proofs.
	function resumeRekeyViaRestore() {
		if (typeof window !== 'undefined') {
			window.location.hash = '/setup?recover=1';
		}
	}

	// ─── Language toggle (TASK-207 / D1.1) ───────────────────
	function switchLanguage(lang: string) {
		currentLang = lang;
		locale.set(lang);
		setSettings({ language: lang });
	}

	// ─── sessionStorage resume + exit warning (TASK-207) ─────
	const RESUME_KEY = 'lnwcash_setup_wizard';

	interface ResumeState {
		mode: SetupMode;
		step: WizardStep;
		seed?: string;
	}

	function persistWizard() {
		try {
			if (mode === 'unlock' || step === 'welcome' || step === 'done' || step === 'restoring' || step === 'rekey') {
				sessionStorage.removeItem(RESUME_KEY);
				return;
			}
			sessionStorage.setItem(
				RESUME_KEY,
				JSON.stringify({ mode, step, seed } satisfies ResumeState)
			);
		} catch {
			// sessionStorage unavailable
		}
	}

	function loadWizard(): ResumeState | null {
		try {
			const raw = sessionStorage.getItem(RESUME_KEY);
			if (!raw) return null;
			return JSON.parse(raw) as ResumeState;
		} catch {
			return null;
		}
	}

	function clearWizard() {
		try {
			sessionStorage.removeItem(RESUME_KEY);
		} catch {
			// ignore
		}
	}

	let stepTitle = $derived(
		isUnlock ? $_('screen.register.unlock_title') :
		step === 'welcome' ? $_('screen.setup.title') :
		step === 'seed' ? $_('screen.setup.seed_title') :
		step === 'verify' ? $_('screen.setup.verify_title') :
		step === 'mints' ? $_('screen.setup.mints_title') :
		step === 'pin' ? $_('screen.register.title') :
		step === 'restoring' ? $_('screen.setup.restoring_title') :
		step === 'rekey' ? $_('screen.setup.rekey_title') :
		$_('screen.setup.done_title')
	);
</script>

<div class="setup-screen" role="main" aria-label={$_('screen.setup.title')}>

	<Card variant="basic" padding="lg">
		<div class="auth-card">

			{#if isUnlock}
				<!-- ─── Unlock PIN (existing wallet, TASK-209 preserved) ─── -->
				<Heading level="h2" align="center">{stepTitle}</Heading>
				<div class="form">
					{#if pendingRekeyDetected}
						<!-- TASK-259 (resume): an interrupted re-key is pending — offer
							 resume via restore (NUT-13) from the NEW seed. -->
						<div class="rekey-warning-banner" role="alert">
							<Body size="sm" weight="medium">
								{$_('screen.setup.rekey_resume_title')}
							</Body>
							<Body size="sm" color="secondary">
								{$_('screen.setup.rekey_resume_body')}
							</Body>
							<div class="rekey-actions">
								<Button variant="primary" onclick={resumeRekeyViaRestore} ariaLabel={$_('screen.setup.rekey_resume_action')}>
									{#snippet children()}{$_('screen.setup.rekey_resume_action')}{/snippet}
								</Button>
							</div>
						</div>
					{/if}

					<Body size="sm" color="secondary" align="center">
						{$_('screen.register.unlock_prompt')}
					</Body>

					{#if pinEntryMode === 'keypad'}
						<div class="pin-entry">
							<Body size="sm" weight="medium" align="center">
								{$_('screen.register.pin_placeholder')}
							</Body>
							{#key attemptKey}
								<PinDots
									length={pin.length}
									total={PIN_LENGTH}
									error={!!error}
									shakeKey={shakeKey}
								/>
								<Keypad
									onDigit={handlePinDigit}
									onBackspace={handlePinBackspace}
									disabled={loading || lockout.locked}
									shuffle={pinShuffle}
								/>
							{/key}
						</div>
					{:else}
						<Input
							type="password"
							label={$_('screen.register.pin_placeholder')}
							placeholder="----"
							maxlength={PIN_LENGTH}
							disabled={loading || lockout.locked}
							oninput={(e) => { pin = (e.target as HTMLInputElement).value; clearError(); }}
						/>
					{/if}

					{#if error}
						<div class="error-banner" role="alert">
							<Body size="sm">{error}</Body>
						</div>
					{/if}

					{#if lockout.locked}
						<div class="lockout-banner" role="alert">
							<Body size="sm">
								Failed too many times — locked. Try again in {formatDuration(Math.max(0, lockout.lockUntil - lockNow))}
							</Body>
						</div>
					{/if}

					<Button
						variant="primary"
						size="lg"
						loading={loading}
						onclick={handleUnlock}
						disabled={loading || pin.length < PIN_LENGTH || lockout.locked}
					>
						{#snippet children()}{$_('screen.register.unlock_title')}{/snippet}
					</Button>

					<Button variant="ghost" size="sm" onclick={togglePinMode}>
						{#snippet children()}{pinEntryMode === 'keypad' ? 'ใช้ช่องกรอก PIN' : 'ใช้แป้นตัวเลขสุ่ม'}{/snippet}
					</Button>
				</div>

			{:else if step === 'welcome'}
				<!-- ─── Welcome: create/recover + tagline + language ─── -->
				<div class="welcome">
					<div class="welcome-brand">
						<img
							src="/lnw-logo-144.png"
							alt="LNWCASH"
							class="welcome-logo"
							width={96}
							height={96}
						/>
						<span class="welcome-wordmark">LNWCASH</span>
					</div>

					<Heading level="h2" align="center">{$_('screen.setup.tagline')}</Heading>

					<div class="language-toggle" role="group" aria-label={$_('screen.language.title')}>
						<button
							type="button"
							class="lang-btn"
							class:active={currentLang === 'th'}
							aria-pressed={currentLang === 'th'}
							onclick={() => switchLanguage('th')}
						>
							{$_('screen.language.th')}
						</button>
						<button
							type="button"
							class="lang-btn"
							class:active={currentLang === 'en'}
							aria-pressed={currentLang === 'en'}
							onclick={() => switchLanguage('en')}
						>
							{$_('screen.language.en')}
						</button>
					</div>

					<div class="choice-list">
						<Card variant="interactive" padding="lg" onclick={chooseCreate}>
							<div class="choice">
								<Heading level="h3">{$_('screen.setup.welcome_create')}</Heading>
								<Body size="sm" color="secondary">{$_('screen.setup.welcome_create_desc')}</Body>
							</div>
						</Card>
						<Card variant="interactive" padding="lg" onclick={chooseRecover}>
							<div class="choice">
								<Heading level="h3">{$_('screen.setup.welcome_recover')}</Heading>
								<Body size="sm" color="secondary">{$_('screen.setup.welcome_recover_desc')}</Body>
							</div>
						</Card>
					</div>
				</div>

			{:else}
				<!-- ─── Wizard (create/recover) ─── -->
				<Body size="sm" weight="semibold" color="secondary" align="center">
					{$_('screen.setup.title')}
				</Body>

			{#if step !== 'restoring' && step !== 'rekey'}
				<ProgressStepper
					steps={stepperSteps}
					currentIndex={stepIndex}
					canContinue={canContinue}
					backLabel={$_('common.back')}
					nextLabel={$_('common.next')}
					onBack={stepIndex > 0 ? goBack : undefined}
					onNext={step === 'seed' ? continueFromSeed : step === 'mints' ? continueFromMints : undefined}
				/>
			{/if}

				<Heading level="h2" align="center">{stepTitle}</Heading>

				{#if step === 'seed'}
					<div class="form">
						{#if mode === 'create'}
							<Body size="sm" color="secondary" align="center">
								{$_('screen.setup.seed_create_prompt')}
							</Body>

							<!-- TASK-208 (D3): no-screenshot banner -->
							<div class="no-screenshot-banner" role="note">
								<Body size="sm" weight="medium">{$_('recovery.warning.title')}</Body>
								<Body size="sm" color="secondary">{$_('recovery.warning.no_screenshot')}</Body>
							</div>

							<SeedGrid words={seedWords} />

							<!-- TASK-208 (D3): paper-only prohibitions -->
							<ul class="paper-warnings">
								<li><Body size="sm" color="secondary">{$_('recovery.warning.paper_only')}</Body></li>
								<li><Body size="sm" color="secondary">{$_('recovery.warning.never_share')}</Body></li>
								<li><Body size="sm" color="secondary">{$_('recovery.warning.anyone_access')}</Body></li>
								<li><Body size="sm" color="secondary">{$_('recovery.warning.lose_access')}</Body></li>
							</ul>

							<label class="seed-ack">
								<input type="checkbox" bind:checked={seedAckChecked} />
								<Body size="sm">{$_('recovery.warning.checkbox_label')}</Body>
							</label>
						{:else}
							<Body size="sm" color="secondary" align="center">
								{$_('screen.setup.seed_recover_prompt')}
							</Body>
							<!-- TASK-208: BIP39 per-word autocomplete import (Recover path) -->
							<div class="seed-import" role="group" aria-label={$_('screen.setup.seed_title')}>
								{#each recoverWords as word, i (i)}
									<div class="seed-word-cell">
										<label class="seed-word-number" for={`recover-word-${i}`}>{i + 1}</label>
										<input
											id={`recover-word-${i}`}
											type="text"
											class="seed-word-input"
											autocomplete="off"
											autocapitalize="none"
											autocorrect="off"
											spellcheck="false"
											disabled={loading}
											value={word}
											aria-label={`${$_('screen.setup.seed_title')} ${i + 1}`}
											oninput={(e) => onRecoverWordInput(i, (e.target as HTMLInputElement).value)}
											onfocus={() => { activeWordIndex = i; }}
											onblur={() => { activeWordIndex = -1; }}
											onkeydown={(e) => onRecoverWordKeydown(i, e)}
										/>
										{#if activeWordIndex === i && seedSuggestions.length > 0}
											<ul class="seed-suggestions" role="listbox" aria-label={$_('recovery.import.placeholder')}>
												{#each seedSuggestions as s (s)}
													<li role="option" aria-selected="false">
														<button
															type="button"
															class="suggestion"
															onmousedown={(e) => e.preventDefault()}
															onclick={() => completeSeedWord(i, s)}
														>
															{s}
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if seedError}
							<div class="error-banner" role="alert">
								<Body size="sm">{seedError}</Body>
							</div>
						{/if}
					</div>

				{:else if step === 'mints'}
					<!-- TASK-259: mint selection (recover wizard) — choose which mints
						 to scan for proofs before restore. Default = mint.lnw.cash. -->
					<div class="form">
						<Body size="sm" color="secondary" align="center">
							{$_('screen.setup.mints_prompt')}
						</Body>

						<div class="mint-select-list" role="group" aria-label={$_('screen.setup.mints_title')}>
							{#each selectedMints as mintUrl (mintUrl)}
								<label class="mint-select-row">
									<input
										type="checkbox"
										checked={selectedMints.includes(mintUrl)}
										onchange={() => toggleMint(mintUrl)}
									/>
									<Body size="sm">{mintUrl}</Body>
								</label>
							{/each}
						</div>

						<div class="add-mint-row">
							<Input
								type="text"
								label={$_('screen.setup.mints_add_label')}
								placeholder={$_('common.placeholder_mint_url')}
								value={customMintUrl}
								oninput={(e) => { customMintUrl = (e.target as HTMLInputElement).value; mintError = ''; }}
							/>
							<Button
								variant="secondary"
								onclick={addMint}
								ariaLabel={$_('screen.setup.mints_add')}
							>
								{#snippet children()}{$_('screen.setup.mints_add')}{/snippet}
							</Button>
						</div>

						{#if mintError}
							<div class="error-banner" role="alert">
								<Body size="sm">{mintError}</Body>
							</div>
						{/if}
					</div>

				{:else if step === 'verify'}
					<div class="form">
						<!-- TASK-208 (D4): random 3-word verification quiz -->
						<SeedVerifyQuiz
							words={seedWords}
							prompt={$_('recovery.quiz.prompt')}
							wordLabelPrefix={$_('recovery.quiz.word_label_prefix')}
							wrongLabel={$_('recovery.quiz.wrong')}
							retryLabel={$_('recovery.quiz.retry')}
							onComplete={onVerifyComplete}
						/>
					</div>

				{:else if step === 'pin'}
					<div class="form">
						{#if pinEntryMode === 'keypad'}
							<div class="pin-entry">
								<Body size="sm" weight="medium" align="center">
									{registerPhase === 'enter'
										? $_('screen.register.pin_placeholder')
										: $_('screen.register.confirm_pin')}
								</Body>
								{#key attemptKey}
									<PinDots
										length={registerPhase === 'enter' ? pin.length : confirmPin.length}
										total={PIN_LENGTH}
										error={!!error}
										shakeKey={shakeKey}
									/>
									<Keypad
										onDigit={handlePinDigit}
										onBackspace={handlePinBackspace}
										disabled={loading}
										shuffle={pinShuffle}
									/>
								{/key}
							</div>
						{:else}
							<Input
								type="password"
								label={$_('screen.register.pin_placeholder')}
								placeholder="----"
								maxlength={PIN_LENGTH}
								disabled={loading}
								oninput={(e) => { pin = (e.target as HTMLInputElement).value; clearError(); }}
							/>

							<Input
								type="password"
								label={$_('screen.register.confirm_pin')}
								placeholder="----"
								maxlength={PIN_LENGTH}
								disabled={loading}
								oninput={(e) => { confirmPin = (e.target as HTMLInputElement).value; clearError(); }}
							/>
						{/if}

						{#if error}
							<div class="error-banner" role="alert">
								<Body size="sm">{error}</Body>
							</div>
						{/if}

						{#if pinEntryMode === 'input'}
							<Button
								variant="primary"
								size="lg"
								onclick={handleRegister}
								disabled={loading || pin.length < PIN_LENGTH || confirmPin.length < PIN_LENGTH}
							>
								{#snippet children()}{$_('screen.register.submit')}{/snippet}
							</Button>
						{/if}

						<Button variant="ghost" size="sm" onclick={togglePinMode}>
							{#snippet children()}{pinEntryMode === 'keypad' ? 'ใช้ช่องกรอก PIN' : 'ใช้แป้นตัวเลขสุ่ม'}{/snippet}
						</Button>
					</div>

			{:else if step === 'restoring'}
				<!-- Blocking NUT-9 fund restore status (recover flow only) — no
					 back/next/stepper, no PWA nudge, no "start using". The user
					 must wait for restore to finish (auto-advance) or fail (retry). -->
				<div class="form">
					<div class="restore-status" role="status" aria-live="polite">
						{#if restoreStatus === 'error'}
							<Body size="sm" color="secondary">{$_('recovery.restore.error')}</Body>
							<Button variant="primary" size="lg" onclick={retryRestore}>
								{#snippet children()}{$_('common.retry')}{/snippet}
							</Button>
						{:else if restoreStatus === 'done'}
							<Body size="sm" color="secondary">{$_('recovery.restore.done', { values: { count: restoredProofs } })}</Body>
						{:else}
							<div class="restore-spinner" aria-hidden="true">
								<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
									<circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="3" opacity="0.25" />
									<path d="M20 4a16 16 0 0 1 13.9 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
								</svg>
							</div>
							<Body size="sm" color="secondary">{$_('recovery.restore.running')}</Body>
							{#if restoreProgress}
								<Body size="sm" color="secondary">{restoreProgress}</Body>
							{/if}
						{/if}
					</div>
				</div>

			{:else if step === 'rekey'}
				<!-- TASK-259: automatic re-key step after restore. Default = re-key
					 (fresh 12-word seed → SeedGrid + paper ack + verify quiz → atomic
					 swap). Skip requires an explicit "seed compromised" confirmation. -->
				<div class="form">
					{#if rekeySkipWarning}
						<div class="rekey-skip-warning" role="alert">
							<Heading level="h4">{$_('screen.setup.rekey_skip_warning_title')}</Heading>
							<Body size="sm" color="secondary">{$_('screen.setup.rekey_skip_warning_body')}</Body>
							<div class="rekey-actions">
								<Button variant="secondary" onclick={cancelSkipRekey} ariaLabel={$_('common.cancel')}>
									{#snippet children()}{$_('common.cancel')}{/snippet}
								</Button>
								<Button variant="primary" onclick={confirmSkipRekey} ariaLabel={$_('screen.setup.rekey_skip_confirm')}>
									{#snippet children()}{$_('screen.setup.rekey_skip_confirm')}{/snippet}
								</Button>
							</div>
						</div>
					{:else if rekeyPhase === 'seed'}
						<div class="rekey-warning-banner" role="note">
							<Body size="sm" weight="medium">{$_('screen.setup.rekey_compromised')}</Body>
						</div>

						<Body size="sm" color="secondary" align="center">
							{$_('screen.setup.rekey_prompt')}
						</Body>

						<SeedGrid words={rekeyWords} />

						<ul class="paper-warnings">
							<li><Body size="sm" color="secondary">{$_('recovery.warning.paper_only')}</Body></li>
							<li><Body size="sm" color="secondary">{$_('recovery.warning.never_share')}</Body></li>
							<li><Body size="sm" color="secondary">{$_('recovery.warning.anyone_access')}</Body></li>
							<li><Body size="sm" color="secondary">{$_('recovery.warning.lose_access')}</Body></li>
						</ul>

						<label class="seed-ack">
							<input type="checkbox" bind:checked={rekeyAckChecked} />
							<Body size="sm">{$_('recovery.warning.checkbox_label')}</Body>
						</label>

						<Button
							variant="primary"
							size="lg"
							onclick={() => { rekeyPhase = 'verify'; }}
							disabled={!rekeyAckChecked}
						>
							{#snippet children()}{$_('common.next')}{/snippet}
						</Button>

						<Button variant="ghost" size="sm" onclick={requestSkipRekey}>
							{#snippet children()}{$_('screen.setup.rekey_skip')}{/snippet}
						</Button>
					{:else if rekeyPhase === 'verify'}
						<SeedVerifyQuiz
							words={rekeyWords}
							prompt={$_('recovery.quiz.prompt')}
							wordLabelPrefix={$_('recovery.quiz.word_label_prefix')}
							wrongLabel={$_('recovery.quiz.wrong')}
							retryLabel={$_('recovery.quiz.retry')}
							onComplete={onRekeyVerifyComplete}
						/>
						<Button variant="ghost" size="sm" onclick={() => { rekeyPhase = 'seed'; }}>
							{#snippet children()}{$_('common.back')}{/snippet}
						</Button>
					{:else if rekeyPhase === 'running'}
						<div class="restore-status" role="status" aria-live="polite">
							<div class="restore-spinner" aria-hidden="true">
								<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
									<circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="3" opacity="0.25" />
									<path d="M20 4a16 16 0 0 1 13.9 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
								</svg>
							</div>
							<Body size="sm" color="secondary">{$_('screen.setup.rekey_running')}</Body>
						</div>
					{:else}
						{#if rekeyError}
							<div class="error-banner" role="alert">
								<Body size="sm">{rekeyError}</Body>
							</div>
						{/if}
						<div class="rekey-actions">
							<Button variant="secondary" onclick={requestSkipRekey}>
								{#snippet children()}{$_('screen.setup.rekey_skip')}{/snippet}
							</Button>
							<Button variant="primary" onclick={runRekey} ariaLabel={$_('common.retry')}>
								{#snippet children()}{$_('common.retry')}{/snippet}
							</Button>
						</div>
					{/if}
				</div>

			{:else if step === 'done'}
				<div class="form">
					<Body size="sm" color="secondary" align="center">
						{$_('screen.setup.done_message')}
					</Body>

					<!-- TASK-207 (D2): PWA manual install nudge (non-blocking) -->
					<div class="pwa-nudge" role="note" aria-label={$_('screen.setup.pwa_nudge_title')}>
						<Heading level="h3">{$_('screen.setup.pwa_nudge_title')}</Heading>
						<Body size="sm" color="secondary">{$_('screen.setup.pwa_nudge_ios')}</Body>
						<Body size="sm" color="secondary">{$_('screen.setup.pwa_nudge_android')}</Body>
						<Body size="sm" color="secondary">{$_('screen.setup.pwa_nudge_desktop')}</Body>
					</div>

					<Button
						variant="primary"
						size="lg"
						onclick={startUsingWallet}
					>
						{#snippet children()}{$_('screen.setup.done_start')}{/snippet}
					</Button>
				</div>
			{/if}
			{/if}
		</div>
	</Card>
</div>

<style>
	.setup-screen {
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.auth-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.error-banner {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-error-light);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-error);
	}

	/* TASK-209 (D5): sharded PIN entry + lockout */
	.pin-entry {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.lockout-banner {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-error-light);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-error);
	}

	/* Welcome */
	.welcome {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.welcome-brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		align-self: center;
	}

	.welcome-logo {
		width: 96px;
		height: 96px;
		aspect-ratio: 1 / 1;
		object-fit: contain;
		flex-shrink: 0;
	}

	.welcome-wordmark {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.language-toggle {
		display: flex;
		gap: 0;
		justify-content: center;
		align-self: center;
		width: fit-content;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.lang-btn {
		min-width: 6rem;
		padding: 0.4rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		background: var(--color-surface-variant);
		border: none;
		cursor: pointer;
		text-align: center;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.lang-btn.active {
		color: var(--color-primary-contrast, #ffffff);
		background: var(--color-primary, #00bcd4);
	}

	.choice-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.choice {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
	}

	/* Seed words (TASK-208: rendered by SeedGrid) */
	.no-screenshot-banner {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.paper-warnings {
		margin: 0;
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.seed-ack {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		cursor: pointer;
		min-height: 44px;
		padding: var(--space-xs) 0;
	}

	.seed-ack input {
		width: 22px;
		height: 22px;
		min-width: 22px;
		margin-top: 0;
		accent-color: var(--color-primary);
		cursor: pointer;
	}

	/* TASK-259: mint selection step (recover wizard) */
	.mint-select-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.mint-select-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
	}

	.mint-select-row input {
		accent-color: var(--color-primary);
	}

	.add-mint-row {
		display: flex;
		align-items: flex-end;
		gap: var(--space-sm);
	}

	.add-mint-row :global(.input-wrap) {
		flex: 1;
	}

	/* TASK-259: re-key step (recover wizard) */
	.rekey-warning-banner {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-warning-light, #fff3cd);
		border: 1px solid var(--color-warning, #ff9800);
		border-radius: var(--radius-md);
	}

	.rekey-skip-warning {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--color-error-light);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
	}

	.rekey-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
		margin-top: var(--space-xs);
	}

	/* Seed import — 12 individual word boxes in a responsive grid (TASK-208) */
	.seed-import {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--space-sm);
	}

	.seed-word-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.seed-word-number {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.seed-word-input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family-mono, ui-monospace, monospace);
		font-size: var(--font-size-md);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		outline: none;
		line-height: var(--line-height-normal);
	}

	.seed-word-input::placeholder {
		color: var(--color-text-disabled);
	}

	.seed-word-input:focus {
		border-color: var(--color-border-focus);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.15);
	}

	.seed-word-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: var(--color-surface-variant);
	}

	.seed-suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: var(--z-dropdown, 100);
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
		max-height: 220px;
		overflow-y: auto;
	}

	.suggestion {
		display: block;
		width: 100%;
		padding: var(--space-xs) var(--space-md);
		font-family: var(--font-family-mono, ui-monospace, monospace);
		font-size: 0.85rem;
		text-align: left;
		color: var(--color-text);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.suggestion:hover,
	.suggestion:focus-visible {
		background: var(--color-surface-variant);
	}

	.restore-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-sm);
		padding: var(--space-lg);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.restore-spinner {
		display: flex;
		color: var(--color-primary);
		animation: restore-spin 0.8s linear infinite;
	}

	@keyframes restore-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* WCAG 2.3.3 — disable spinner animation for reduced-motion users */
	@media (prefers-reduced-motion: reduce) {
		.restore-spinner {
			animation: none;
		}
	}

	/* PWA nudge */
	.pwa-nudge {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		padding: var(--space-md);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}
</style>
