/**
 * Test: Setup.svelte — TASK-207 multi-step setup wizard
 *      + preserves TASK-209 (D5) 4-digit PIN keypad + lockout
 *      + preserves TASK-091 (F-067) setActiveMintUrl on wallet creation
 *      + TASK-092 (F-061) session PIN for auto-unlock
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte/svelte5';
import Setup from '../../screens/Setup.svelte';
import { getWalletStatus, unlockWallet, storeSessionPin } from '$lib/wallet/state';
import { importSeed, seedToPrivateKey } from '$lib/wallet/seed';
import { generateMnemonic } from '$lib/wallet/keys';
import { setActiveMintUrl } from '$lib/wallet/store';
import { restoreWallet } from '$lib/wallet/restore';
import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
import { locale } from 'svelte-i18n';

// Distinct 12-word phrase for deterministic verify-step tests.
const MNEMONIC =
	'abandon ability able about above absent absorb abstract absurd abuse access accident';
const WORDS = MNEMONIC.split(' ');

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('en');
				return () => {};
			},
			set: vi.fn()
		},
		init() {},
		register() {},
		getLocaleFromNavigator() {
			return 'en';
		}
	};
});

vi.mock('$lib/wallet/state', () => ({
	getWalletStatus: vi.fn(() => ({
		state: 'UNINITIALIZED',
		walletName: null,
		createdAt: null
	})),
	unlockWallet: vi.fn(async () => ({
		state: 'UNLOCKED',
		walletName: 'LNWCASH Wallet',
		createdAt: Date.now()
	})),
	storeSessionPin: vi.fn(),
	getSessionPin: vi.fn(() => null)
}));

vi.mock('$lib/wallet/seed', () => ({
	importSeed: vi.fn(async () => ({ publicKey: 'pubkey' })),
	seedToPrivateKey: vi.fn(() => 'private-key')
}));

vi.mock('$lib/wallet/keys', () => ({
	generateMnemonic: vi.fn(() => MNEMONIC)
}));

vi.mock('$lib/wallet/lockout', () => ({
	getLockoutStatus: vi.fn(async () => ({
		attempts: 0,
		maxAttempts: 5,
		locked: false,
		lockUntil: 0,
		remainingMs: 0,
		level: 'none'
	})),
	recordFailure: vi.fn(async () => ({
		attempts: 1,
		maxAttempts: 5,
		locked: false,
		lockUntil: 0,
		remainingMs: 0,
		level: 'none'
	})),
	recordSuccess: vi.fn(async () => {}),
	resetLockout: vi.fn(async () => {}),
	MAX_ATTEMPTS: 5
}));

vi.mock('$lib/wallet/store', () => ({
	getMintConfig: vi.fn().mockReturnValue(null),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	getDefaultMintUrl: () => 'https://mint.lnw.cash',
	getAllMintConfigs: vi.fn(() => [{ url: 'https://mint.lnw.cash', name: 'LNWCASH mint' }]),
	activeMintStore: {
		subscribe: vi.fn(() => () => {}),
		set: vi.fn()
	}
}));

// TASK-208: NUT-9 restore + NUT-13 seed + keyset discovery (mock the network).
vi.mock('$lib/wallet/restore', () => ({
	restoreWallet: vi.fn(async () => ({ success: true, proofs: [], counter: 0 }))
}));

vi.mock('$lib/wallet/nut13', () => ({
	setActiveSeed: vi.fn(),
	seedFromMnemonic: vi.fn(() => new Uint8Array(64)),
	getActiveSeed: vi.fn(() => null)
}));

vi.mock('$lib/wallet/rekey', () => ({
	rekeyWallet: vi.fn(async () => ({ success: true, swappedCount: 0, receivedCount: 0, batches: 0 }))
}));

vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn(async () => [])
}));

// ─── Helpers ────────────────────────────────────────────────
const digitButtons = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('.key-btn')).filter(
		(b) => !b.classList.contains('key-backspace')
	);

const backButton = (container: HTMLElement) =>
	container.querySelector('.stepper-btn:not(.stepper-btn-next)') as HTMLButtonElement | null;

const nextButton = (container: HTMLElement) =>
	container.querySelector('.stepper-btn-next') as HTMLButtonElement | null;

/** Check the paper-only ack checkbox (TASK-208 D3). */
async function checkPaperAck(container: HTMLElement) {
	const checkbox = container.querySelector('.seed-ack input') as HTMLInputElement;
	expect(checkbox, 'paper-only ack checkbox').toBeTruthy();
	checkbox.checked = true;
	await fireEvent.change(checkbox);
}

/** Complete the random 3-word quiz by reading each input's `quiz-{N}` id. */
async function completeQuiz(container: HTMLElement) {
	const inputs = Array.from(
		container.querySelectorAll('.verify-quiz-input') as NodeListOf<HTMLInputElement>
	);
	expect(inputs.length).toBe(3);
	for (const input of inputs) {
		const m = input.id.match(/quiz-(\d+)/);
		expect(m, `quiz input id ${input.id}`).toBeTruthy();
		const position = Number(m![1]);
		await fireEvent.input(input, { target: { value: WORDS[position - 1] } });
	}
}

/** Drive the 4-digit keypad through enter + confirm phases (create flow). */
async function enterPinTwice(container: HTMLElement) {
	const digits = digitButtons(container);
	for (let i = 0; i < 4; i++) await fireEvent.click(digits[i]);
	for (let i = 0; i < 4; i++) await fireEvent.click(digits[i]);
}

/** Add a mint via the mint-selection UI (recover wizard, TASK-259). */
async function addMintViaUI(container: HTMLElement, url: string) {
	const addInput = container.querySelector('.add-mint-row input') as HTMLInputElement;
	await fireEvent.input(addInput, { target: { value: url } });
	await fireEvent.click(screen.getByText('screen.setup.mints_add'));
}

describe('Setup (TASK-207 wizard + TASK-209 PIN preserved)', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		vi.clearAllMocks();
		vi.mocked(generateMnemonic).mockReturnValue(MNEMONIC);
		vi.mocked(getWalletStatus).mockReturnValue({
			state: 'UNINITIALIZED',
			walletName: null,
			createdAt: null
		});
	});
	afterEach(() => cleanup());

	// ─── Welcome ────────────────────────────────────────────
	it('renders welcome with tagline + create/recover + language toggle', () => {
		render(Setup, {});
		// NOTE: "Wallet Setup" (screen.setup.title) is NOT on the welcome screen —
		// it moved to the wizard steps header (Option A redesign).
		expect(screen.getByText('screen.setup.tagline')).toBeTruthy();
		expect(screen.getByText('screen.setup.welcome_create')).toBeTruthy();
		expect(screen.getByText('screen.setup.welcome_recover')).toBeTruthy();
		expect(screen.getByText('screen.language.th')).toBeTruthy();
		expect(screen.getByText('screen.language.en')).toBeTruthy();
	});

	it('language toggle switches locale (TH/EN)', async () => {
		render(Setup, {});
		await fireEvent.click(screen.getByText('screen.language.th'));
		expect(locale.set as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('th');
		await fireEvent.click(screen.getByText('screen.language.en'));
		expect(locale.set as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('en');
	});

	// ─── Create flow ────────────────────────────────────────
	it('create → seed step shows 12-word grid + paper ack + stepper', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_create'));
		expect(screen.getByText('screen.setup.seed_title')).toBeTruthy();
		expect(screen.getByText('screen.setup.seed_create_prompt')).toBeTruthy();
		// TASK-208 D4: 12-word grid (NOT 24)
		expect(container.querySelectorAll('.seed-cell').length).toBe(12);
		// TASK-208 D3: no-screenshot banner + paper-only warnings + checkbox
		expect(screen.getByText('recovery.warning.no_screenshot')).toBeTruthy();
		expect(screen.getByText('recovery.warning.paper_only')).toBeTruthy();
		expect(screen.getByText('recovery.warning.checkbox_label')).toBeTruthy();
		expect(container.querySelector('.seed-ack input')).toBeTruthy();
		expect(backButton(container)).toBeTruthy();
		expect(nextButton(container)).toBeTruthy();
	});

	it('create seed next is disabled until paper-only ack checked (D3)', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_create'));
		expect(nextButton(container)!.disabled).toBe(true);
		await checkPaperAck(container);
		expect(nextButton(container)!.disabled).toBe(false);
	});

	it('back navigation returns to welcome from seed step', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_create'));
		await fireEvent.click(backButton(container)!);
		expect(screen.getByText('screen.setup.tagline')).toBeTruthy();
	});

	it('create → verify step (random 3-word quiz) → PIN step', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_create'));
		await checkPaperAck(container);
		await fireEvent.click(nextButton(container)!);
		expect(screen.getByText('screen.setup.verify_title')).toBeTruthy();
		expect(container.querySelectorAll('.verify-quiz-input').length).toBe(3);
		await completeQuiz(container);
		expect(screen.getByText('screen.register.pin_placeholder')).toBeTruthy();
	});

	it('full create flow reaches Done with PWA nudge + start button', async () => {
		const onWalletReady = vi.fn();
		const { container } = render(Setup, { onWalletReady });
		await fireEvent.click(screen.getByText('screen.setup.welcome_create'));
		await checkPaperAck(container);
		await fireEvent.click(nextButton(container)!);
		await completeQuiz(container);
		await enterPinTwice(container);
		await waitFor(() => expect(screen.getByText('screen.setup.done_title')).toBeTruthy());
		expect(screen.getByText('screen.setup.pwa_nudge_title')).toBeTruthy();
		expect(screen.getByText('screen.setup.pwa_nudge_ios')).toBeTruthy();
		expect(screen.getByText('screen.setup.pwa_nudge_android')).toBeTruthy();
		expect(screen.getByText('screen.setup.pwa_nudge_desktop')).toBeTruthy();
		await fireEvent.click(screen.getByText('screen.setup.done_start'));
		expect(onWalletReady).toHaveBeenCalled();
		expect(importSeed).toHaveBeenCalledWith(MNEMONIC, expect.any(String), 'LNWCASH Wallet');
		expect(setActiveMintUrl).toHaveBeenCalled();
	});

	// ─── Recover flow ───────────────────────────────────────
	it('recover → enter seed → mint selection → PIN step (skips verify)', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
		expect(screen.getByText('screen.setup.seed_recover_prompt')).toBeTruthy();
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: MNEMONIC } });
		await fireEvent.click(nextButton(container)!);
		// TASK-259: mint selection step (default mint pre-selected) before restore
		expect(screen.getByText('screen.setup.mints_title')).toBeTruthy();
		await fireEvent.click(nextButton(container)!);
		expect(screen.getByText('screen.register.pin_placeholder')).toBeTruthy();
	});

	it('recover rejects invalid seed phrase', async () => {
		vi.mocked(seedToPrivateKey).mockImplementation(() => {
			throw new Error('invalid seed');
		});
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'not a valid phrase' } });
		await fireEvent.click(nextButton(container)!);
		expect(screen.getByText('screen.setup.seed_invalid')).toBeTruthy();
	});

	it('recover import shows BIP39 autocomplete suggestions (2048-word list)', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'acc' } });
		const suggestions = Array.from(container.querySelectorAll('.suggestion'));
		expect(suggestions.length).toBeGreaterThan(0);
		expect(suggestions.map((b) => b.textContent?.trim())).toContain('accident');
		await fireEvent.click(suggestions.find((b) => b.textContent?.trim() === 'accident')!);
		expect(input.value).toBe('accident');
	});

	// ─── Existing wallet → unlock (TASK-209 preserved) ──────
	it('existing wallet skips straight to PIN unlock with keypad + lockout', () => {
		vi.mocked(getWalletStatus).mockReturnValue({
			state: 'LOCKED',
			walletName: 'LNWCASH Wallet',
			createdAt: 1
		});
		const { container } = render(Setup, {});
		expect(screen.getByText('screen.register.unlock_prompt')).toBeTruthy();
		// TASK-209: randomized keypad renders 10 digits + backspace
		expect(container.querySelectorAll('.key-btn').length).toBe(11);
	});

	it('unlock calls onWalletReady after 4 digits', async () => {
		vi.mocked(getWalletStatus).mockReturnValue({
			state: 'LOCKED',
			walletName: 'LNWCASH Wallet',
			createdAt: 1
		});
		const onWalletReady = vi.fn();
		const { container } = render(Setup, { onWalletReady });
		const digits = digitButtons(container);
		for (let i = 0; i < 4; i++) await fireEvent.click(digits[i]);
		await waitFor(() => expect(onWalletReady).toHaveBeenCalled());
		expect(unlockWallet).toHaveBeenCalled();
		const enteredPin = vi.mocked(unlockWallet).mock.calls[0][0] as string;
		expect(enteredPin).toHaveLength(4);
		expect(storeSessionPin).toHaveBeenCalled();
	});

	// ─── sessionStorage resume ──────────────────────────────
	it('resumes wizard from sessionStorage', () => {
		sessionStorage.setItem(
			'lnwcash_setup_wizard',
			JSON.stringify({ mode: 'create', step: 'seed', seed: MNEMONIC })
		);
		const { container } = render(Setup, {});
		expect(screen.getByText('screen.setup.seed_title')).toBeTruthy();
		expect(container.querySelectorAll('.seed-cell').length).toBe(12);
	});

	// ─── TASK-217/TASK-259: multi-mint NUT-9 restore ─────────
	it('recover restores funds across the user-selected mints (multi-mint)', async () => {
		// Reset seedToPrivateKey (a prior test overrides it to throw for the
		// "invalid seed" case — clearAllMocks does not reset implementations).
		vi.mocked(seedToPrivateKey).mockReturnValue('private-key');
		vi.mocked(fetchAndCacheKeysets).mockResolvedValue([
			{ id: 'ks-active-1', unit: 'sat', active: true }
		] as any);
		vi.mocked(restoreWallet).mockResolvedValue({
			success: true,
			proofs: [{ id: 'p1', amount: 10, secret: 's', C: 'c' }],
			counter: 1
		});

		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: MNEMONIC } });
		await fireEvent.click(nextButton(container)!);

		// TASK-259: mint selection — add mint A + B, uncheck the default mint.
		await addMintViaUI(container, 'https://mint-a.example');
		await addMintViaUI(container, 'https://mint-b.example');
		const defaultCheckbox = Array.from(
			container.querySelectorAll('.mint-select-row input') as NodeListOf<HTMLInputElement>
		).find((cb) => (cb.closest('.mint-select-row')?.textContent ?? '').includes('mint.lnw.cash'));
		expect(defaultCheckbox, 'default mint checkbox').toBeTruthy();
		defaultCheckbox!.checked = false;
		await fireEvent.change(defaultCheckbox!);

		await fireEvent.click(nextButton(container)!);
		await enterPinTwice(container);

		await waitFor(() => expect(restoreWallet).toHaveBeenCalledTimes(2));
		expect(restoreWallet).toHaveBeenCalledWith(
			'https://mint-a.example',
			expect.any(Uint8Array),
			'ks-active-1',
			{}
		);
		expect(restoreWallet).toHaveBeenCalledWith(
			'https://mint-b.example',
			expect.any(Uint8Array),
			'ks-active-1',
			{}
		);
	});
});
