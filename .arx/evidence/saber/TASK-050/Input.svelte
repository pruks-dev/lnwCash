<script lang="ts">
	/**
	 * Input — D-004
	 * Variants: text, number, search
	 * Features: label, error message, disabled, required
	 */
	interface Props {
		/** Input type */
		type?: 'text' | 'number' | 'search' | 'email' | 'password';
		/** Label text */
		label?: string;
		/** Current value (bound from parent) */
		value?: string | number;
		/** Placeholder */
		placeholder?: string;
		/** Error message — renders error state when truthy */
		error?: string;
		/** Disabled state */
		disabled?: boolean;
		/** Required marker */
		required?: boolean;
		/** Input id (auto-generated if omitted) */
		id?: string;
		/** Input name */
		name?: string;
		/** Autocomplete */
		autocomplete?: string | null;
		/** Min value (for number type) */
		min?: number;
		/** Max value (for number type) */
		max?: number;
		/** Step (for number type) */
		step?: number;
		/** Leading icon snippet */
		leading?: import('svelte').Snippet;
		/** Trailing action snippet */
		trailing?: import('svelte').Snippet;
		/** Input event */
		oninput?: (e: Event) => void;
		/** Change event */
		onchange?: (e: Event) => void;
		/** Focus event */
		onfocus?: (e: FocusEvent) => void;
		/** Blur event */
		onblur?: (e: FocusEvent) => void;
	}

	let {
		type = 'text',
		label = undefined,
		value = undefined,
		placeholder = undefined,
		error = undefined,
		disabled = false,
		required = false,
		id: propId = undefined,
		name = undefined,
		autocomplete = undefined,
		min = undefined,
		max = undefined,
		step = undefined,
		leading,
		trailing,
		oninput,
		onchange,
		onfocus,
		onblur
	}: Props = $props();

	const uid = $derived(propId ?? `input-${crypto.randomUUID().slice(0, 8)}`);
	const hasError = $derived(!!error);
</script>

<div class="input-wrapper" class:input-error={hasError} class:input-disabled={disabled}>
	{#if label}
		<label class="input-label" for={uid}>
			{label}
			{#if required}
				<span class="input-required" aria-label="required">*</span>
			{/if}
		</label>
	{/if}

	<div class="input-field-wrapper">
		{#if leading}
			<span class="input-leading" aria-hidden="true">
				{@render leading()}
			</span>
		{/if}

		<input
			{type}
			id={uid}
			{name}
			{placeholder}
			{disabled}
			{required}
			{...{autocomplete: autocomplete as any}}
			{min}
			{max}
			{step}
			value={value}
			class="input-field"
			class:input-has-leading={!!leading}
			class:input-has-trailing={!!trailing}
			aria-invalid={hasError}
			aria-describedby={hasError ? `${uid}-error` : undefined}
			oninput={oninput}
			onchange={onchange}
			onfocus={onfocus}
			onblur={onblur}
		/>

		{#if trailing}
			<span class="input-trailing" aria-hidden="true">
				{@render trailing()}
			</span>
		{/if}
	</div>

	{#if hasError}
		<p id="{uid}-error" class="input-error-text" role="alert" aria-live="polite">
			{error}
		</p>
	{/if}
</div>

<style>
	.input-wrapper {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		width: 100%;
	}

	.input-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}

	.input-required {
		color: var(--color-error);
		margin-left: 2px;
	}

	.input-field-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-leading,
	.input-trailing {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		color: var(--color-text-secondary);
	}

	.input-leading {
		left: var(--space-sm);
	}

	.input-trailing {
		right: var(--space-sm);
	}

	.input-field {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		outline: none;
		line-height: var(--line-height-normal);
	}

	.input-has-leading {
		padding-left: calc(var(--space-sm) + 20px);
	}

	.input-has-trailing {
		padding-right: calc(var(--space-sm) + 20px);
	}

	.input-field::placeholder {
		color: var(--color-text-disabled);
	}

	.input-field:focus {
		border-color: var(--color-border-focus);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.15);
	}

	.input-error .input-field {
		border-color: var(--color-error);
	}

	.input-error .input-field:focus {
		box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.15);
	}

	.input-disabled .input-field {
		opacity: 0.5;
		cursor: not-allowed;
		background: var(--color-surface-variant);
	}

	.input-error-text {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--color-error);
		line-height: var(--line-height-tight);
	}
</style>
