/**
 * Keypad tests — TASK-209 (D5) 4-digit sharded PIN entry
 *             + TASK-220 `shuffle` prop (CSPRNG Fisher-Yates).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte/svelte5';
import Keypad from '../Keypad.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const digitButtons = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('.key-btn')).filter(
		(b) => !b.classList.contains('key-backspace')
	);

const FIXED_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ALL_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

describe('Keypad (TASK-209 D5)', () => {
	it('renders 10 digit buttons + 1 backspace', () => {
		const { container } = render(Keypad, {});
		expect(container.querySelectorAll('.key-btn').length).toBe(11);
		expect(container.querySelector('.key-backspace')).toBeTruthy();
	});

	it('renders every digit 0-9 exactly once', () => {
		const { container } = render(Keypad, {});
		const labels = digitButtons(container).map((b) => b.textContent?.trim());
		expect(labels.length).toBe(10);
		expect(new Set(labels).size).toBe(10);
		expect([...labels].sort()).toEqual(ALL_DIGITS);
	});

	it('calls onDigit with the pressed digit', async () => {
		const onDigit = vi.fn();
		const { container } = render(Keypad, { onDigit });
		const btn = digitButtons(container)[0];
		await fireEvent.click(btn);
		expect(onDigit).toHaveBeenCalledOnce();
		expect(onDigit).toHaveBeenCalledWith(btn.textContent!.trim());
	});

	it('calls onBackspace when backspace pressed', async () => {
		const onBackspace = vi.fn();
		const { container } = render(Keypad, { onBackspace });
		await fireEvent.click(container.querySelector('.key-backspace')!);
		expect(onBackspace).toHaveBeenCalledOnce();
	});

	it('ignores input when disabled', async () => {
		const onDigit = vi.fn();
		const onBackspace = vi.fn();
		const { container } = render(Keypad, { onDigit, onBackspace, disabled: true });
		const btn = container.querySelectorAll('.key-btn')[0] as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		await fireEvent.click(btn);
		expect(onDigit).not.toHaveBeenCalled();
		expect(onBackspace).not.toHaveBeenCalled();
	});
});

describe('Keypad shuffle prop (TASK-220)', () => {
	it('renders fixed 1-9 + 0 order when shuffle is false (default)', () => {
		const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
		const { container } = render(Keypad, {});
		const labels = digitButtons(container).map((b) => b.textContent?.trim());
		expect(labels).toEqual(FIXED_ORDER);
		expect(spy).not.toHaveBeenCalled();
	});

	it('renders fixed order when shuffle is explicitly false', () => {
		const { container } = render(Keypad, { shuffle: false });
		const labels = digitButtons(container).map((b) => b.textContent?.trim());
		expect(labels).toEqual(FIXED_ORDER);
	});

	it('uses crypto.getRandomValues (CSPRNG) when shuffle is true', () => {
		const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
		render(Keypad, { shuffle: true });
		expect(spy).toHaveBeenCalled();
	});

	it('shuffle=true still renders the same 10 digits (just permuted)', () => {
		const { container } = render(Keypad, { shuffle: true });
		const labels = digitButtons(container).map((b) => b.textContent?.trim());
		expect(new Set(labels).size).toBe(10);
		expect([...labels].sort()).toEqual(ALL_DIGITS);
	});

	it('shuffle=true produces a different order than fixed (deterministic RNG)', () => {
		vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr: any) => {
			arr.fill(0);
			return arr;
		});
		const { container } = render(Keypad, { shuffle: true });
		const labels = digitButtons(container).map((b) => b.textContent?.trim());
		expect(labels).not.toEqual(FIXED_ORDER);
		expect(new Set(labels).size).toBe(10);
	});
});
