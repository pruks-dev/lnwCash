/**
 * Test: Setup.svelte recover wizard — TASK-259 mint selection + re-key step.
 *
 * Covers:
 *   - Mint selection step (default mint pre-selected + add mint + duplicate).
 *   - Re-key step round-trip: new 12-word seed → SeedGrid → paper ack → verify
 *     quiz → rekeyWallet() called with the selected mints.
 *   - Skip path: explicit "seed compromised" warning + confirmation (default is
 *     re-key — there is NO silent auto-skip).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte/svelte5';
import Setup from '../../screens/Setup.svelte';
import { getWalletStatus } from '$lib/wallet/state';
import { seedToPrivateKey } from '$lib/wallet/seed';
import { generateMnemonic } from '$lib/wallet/keys';
import { restoreWallet } from '$lib/wallet/restore';
import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
import { rekeyWallet } from '$lib/wallet/rekey';

// Distinct 12-word phrases.
const RECOVER_MNEMONIC =
	'abandon ability able about above absent absorb abstract absurd abuse access accident';
const NEW_MNEMONIC = 'one two three four five six seven eight nine ten eleven twelve';
const NEW_WORDS = NEW_MNEMONIC.split(' ');

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
	generateMnemonic: vi.fn(() => NEW_MNEMONIC)
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

vi.mock('$lib/wallet/restore', () => ({
	restoreWallet: vi.fn(async () => ({ success: true, proofs: [], counter: 0 }))
}));

vi.mock('$lib/wallet/nut13', () => ({
	setActiveSeed: vi.fn(),
	seedFromMnemonic: vi.fn(() => new Uint8Array(64)),
	getActiveSeed: vi.fn(() => null)
}));

vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn(async () => [])
}));

vi.mock('$lib/wallet/rekey', () => ({
	rekeyWallet: vi.fn(async () => ({ success: true, swappedCount: 0, receivedCount: 0, batches: 0 }))
}));

// ─── Helpers ────────────────────────────────────────────────
const nextButton = (container: HTMLElement) =>
	container.querySelector('.stepper-btn-next') as HTMLButtonElement | null;

const digitButtons = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('.key-btn')).filter(
		(b) => !b.classList.contains('key-backspace')
	);

async function enterPinTwice(container: HTMLElement) {
	const digits = digitButtons(container);
	for (let i = 0; i < 4; i++) await fireEvent.click(digits[i]);
	for (let i = 0; i < 4; i++) await fireEvent.click(digits[i]);
}

async function addMintViaUI(container: HTMLElement, url: string) {
	const addInput = container.querySelector('.add-mint-row input') as HTMLInputElement;
	await fireEvent.input(addInput, { target: { value: url } });
	await fireEvent.click(screen.getByText('screen.setup.mints_add'));
}

/** Complete the re-key 3-word verify quiz by reading each input's quiz-{N} id. */
async function completeQuiz(container: HTMLElement) {
	const inputs = Array.from(
		container.querySelectorAll('.verify-quiz-input') as NodeListOf<HTMLInputElement>
	);
	expect(inputs.length).toBe(3);
	for (const input of inputs) {
		const m = input.id.match(/quiz-(\d+)/);
		expect(m, `quiz input id ${input.id}`).toBeTruthy();
		const position = Number(m![1]);
		await fireEvent.input(input, { target: { value: NEW_WORDS[position - 1] } });
	}
}

/** Drive the recover wizard to the re-key step (seed → mints → pin → restore). */
async function reachRekeyStep(container: HTMLElement) {
	await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
	const input = container.querySelector('input') as HTMLInputElement;
	await fireEvent.input(input, { target: { value: RECOVER_MNEMONIC } });
	await fireEvent.click(nextButton(container)!);
	await fireEvent.click(nextButton(container)!); // mints (default mint pre-selected)
	await enterPinTwice(container);
	await waitFor(() => expect(screen.getByText('screen.setup.rekey_title')).toBeTruthy());
}

describe('Setup recover — TASK-259 mint selection + re-key', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		vi.clearAllMocks();
		vi.mocked(generateMnemonic).mockReturnValue(NEW_MNEMONIC);
		vi.mocked(getWalletStatus).mockReturnValue({
			state: 'UNINITIALIZED',
			walletName: null,
			createdAt: null
		});
	});
	afterEach(() => cleanup());

	// ─── Mint selection ─────────────────────────────────────
	it('mint selection: default mint pre-selected + add mint + duplicate rejected', async () => {
		const { container } = render(Setup, {});
		await fireEvent.click(screen.getByText('screen.setup.welcome_recover'));
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: RECOVER_MNEMONIC } });
		await fireEvent.click(nextButton(container)!);

		// default mint is pre-selected
		const defaultCheckbox = Array.from(
			container.querySelectorAll('.mint-select-row input') as NodeListOf<HTMLInputElement>
		).find((cb) => (cb.closest('.mint-select-row')?.textContent ?? '').includes('mint.lnw.cash'));
		expect(defaultCheckbox, 'default mint checkbox').toBeTruthy();
		expect(defaultCheckbox!.checked).toBe(true);

		// add a custom mint
		await addMintViaUI(container, 'https://mint-a.example');
		expect(
			Array.from(container.querySelectorAll('.mint-select-row')).some((r) =>
				(r.textContent ?? '').includes('mint-a.example')
			)
		).toBe(true);

		// duplicate → error
		await addMintViaUI(container, 'https://mint-a.example');
		expect(screen.getByText('screen.setup.mints_duplicate')).toBeTruthy();
	});

	// ─── Re-key round-trip ─────────────────────────────────
	it('re-key: new seed → SeedGrid + paper ack + quiz → rekeyWallet called with mints', async () => {
		const { container } = render(Setup, {});
		await reachRekeyStep(container);

		// re-key seed phase: strong "compromised" banner + 12-word grid + ack
		expect(screen.getByText('screen.setup.rekey_compromised')).toBeTruthy();
		expect(container.querySelectorAll('.seed-cell').length).toBe(12);

		// continue disabled until paper ack
		const continueBtn = screen.getByRole('button', { name: 'common.next' }) as HTMLButtonElement;
		expect(continueBtn.disabled).toBe(true);

		const ack = container.querySelector('.seed-ack input') as HTMLInputElement;
		ack.checked = true;
		await fireEvent.change(ack);
		await fireEvent.click(continueBtn);

		// verify quiz
		await completeQuiz(container);

		await waitFor(() =>
			expect(rekeyWallet).toHaveBeenCalledWith(
				NEW_MNEMONIC,
				expect.any(String),
				{ mints: ['https://mint.lnw.cash'] }
			)
		);
		await waitFor(() => expect(screen.getByText('screen.setup.done_title')).toBeTruthy());
	});

	// ─── Skip path (default = re-key, no auto-skip) ────────
	it('skip re-key requires explicit "seed compromised" confirmation (no auto-skip)', async () => {
		const { container } = render(Setup, {});
		await reachRekeyStep(container);

		// request skip → strong warning appears, rekeyWallet NOT called yet
		await fireEvent.click(screen.getByText('screen.setup.rekey_skip'));
		expect(screen.getByText('screen.setup.rekey_skip_warning_title')).toBeTruthy();
		expect(screen.getByText('screen.setup.rekey_skip_warning_body')).toBeTruthy();
		expect(rekeyWallet).not.toHaveBeenCalled();

		// cancel → back to the re-key seed phase (still on rekey step)
		await fireEvent.click(screen.getByText('common.cancel'));
		expect(screen.getByText('screen.setup.rekey_compromised')).toBeTruthy();
		expect(rekeyWallet).not.toHaveBeenCalled();

		// confirm skip → done WITHOUT re-key
		await fireEvent.click(screen.getByText('screen.setup.rekey_skip'));
		await fireEvent.click(screen.getByText('screen.setup.rekey_skip_confirm'));
		await waitFor(() => expect(screen.getByText('screen.setup.done_title')).toBeTruthy());
		expect(rekeyWallet).not.toHaveBeenCalled();
	});
});
