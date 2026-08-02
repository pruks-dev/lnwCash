<script lang="ts">
	/**
	 * Numpad — Reusable numeric keypad for amount input (TASK-066)
	 * Features: 0-9 digits, backspace, decimal point, confirm button
	 * Touch-friendly large buttons, mobile-first design
	 *
	 * Props:
	 *   value — current displayed value string
	 *   onchange — called with new value after each input
	 *   onconfirm — called when confirm/OK button is pressed
	 *   confirmLabel — label for confirm button (default: "✓")
	 *   maxDigits — maximum digits before decimal (default: 8)
	 *   maxDecimals — maximum decimal places (default: 2)
	 *   disabled — disable all buttons
	 */
	interface Props {
		value?: string;
		onchange?: (value: string) => void;
		onconfirm?: () => void;
		confirmLabel?: string;
		maxDigits?: number;
		maxDecimals?: number;
		disabled?: boolean;
	}

	let {
		value = '0',
		onchange,
		onconfirm,
		confirmLabel = 'ตกลง',
		maxDigits = 8,
		maxDecimals = 2,
		disabled = false
	}: Props = $props();

	function emit(newValue: string) {
		onchange?.(newValue);
	}

	function handleDigit(digit: string) {
		if (disabled) return;
		let current = value;
		if (current === '0' && digit !== '.') {
			current = digit;
		} else {
			// Check decimal limits
			if (digit === '.') {
				if (current.includes('.')) return;
				current += digit;
			} else {
				const parts = current.split('.');
				if (parts.length === 2 && parts[1].length >= maxDecimals) return;
				if (!current.includes('.') && parts[0].length >= maxDigits) return;
				current += digit;
			}
		}
		emit(current);
	}

	function handleBackspace() {
		if (disabled) return;
		let current = value;
		if (current.length <= 1) {
			emit('0');
		} else {
			emit(current.slice(0, -1));
		}
	}

	function handleDecimal() {
		if (disabled) return;
		handleDigit('.');
	}

	function handleConfirm() {
		if (disabled) return;
		onconfirm?.();
	}
</script>

<div class="numpad" class:numpad-disabled={disabled}>
	<div class="numpad-row">
		<button type="button" class="num-btn" onclick={() => handleDigit('1')} disabled={disabled} aria-label="1">1</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('2')} disabled={disabled} aria-label="2">2</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('3')} disabled={disabled} aria-label="3">3</button>
	</div>
	<div class="numpad-row">
		<button type="button" class="num-btn" onclick={() => handleDigit('4')} disabled={disabled} aria-label="4">4</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('5')} disabled={disabled} aria-label="5">5</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('6')} disabled={disabled} aria-label="6">6</button>
	</div>
	<div class="numpad-row">
		<button type="button" class="num-btn" onclick={() => handleDigit('7')} disabled={disabled} aria-label="7">7</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('8')} disabled={disabled} aria-label="8">8</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('9')} disabled={disabled} aria-label="9">9</button>
	</div>
	<div class="numpad-row">
		<button type="button" class="num-btn num-decimal" onclick={handleDecimal} disabled={disabled} aria-label="Decimal">.</button>
		<button type="button" class="num-btn" onclick={() => handleDigit('0')} disabled={disabled} aria-label="0">0</button>
		<button type="button" class="num-btn num-backspace" onclick={handleBackspace} disabled={disabled} aria-label="Backspace">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
				<line x1="18" y1="9" x2="12" y2="15"/>
				<line x1="12" y1="9" x2="18" y2="15"/>
			</svg>
		</button>
	</div>
	{#if onconfirm}
		<div class="numpad-row numpad-confirm-row">
			<button type="button" class="num-confirm-btn" onclick={handleConfirm} disabled={disabled}>
				{confirmLabel}
			</button>
		</div>
	{/if}
</div>

<style>
	.numpad {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		max-width: 360px;
		margin: 0 auto;
		padding: var(--space-sm) 0;
	}

	.numpad-disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.numpad-row {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
	}

	.num-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 56px;
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast), transform var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		box-shadow: var(--shadow-sm);
	}

	.num-btn:hover:not(:disabled) {
		background: var(--color-surface-variant);
	}

	.num-btn:active:not(:disabled) {
		transform: scale(0.95);
		background: var(--color-border);
	}

	.num-btn:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.num-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.num-decimal {
		color: var(--color-primary);
		font-weight: var(--font-weight-bold);
	}

	.num-backspace {
		color: var(--color-text-secondary);
		background: var(--color-surface-variant);
	}

	.numpad-confirm-row {
		margin-top: var(--space-xs);
	}

	.num-confirm-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		cursor: pointer;
		transition: background var(--transition-fast), transform var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
	}

	.num-confirm-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.num-confirm-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.num-confirm-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.num-confirm-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
