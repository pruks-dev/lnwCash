<!--
  TASK-5603 — PosModifierPopup (INTENT-056 BLUEPRINT-056 v2, approved mockup 2/3).
  Sheet after tapping a catalog card: modifier chips (single-select) + a
  per-row note input → Add appends a SEPARATE bill row (identity =
  product+modifier+note, cart.ts). Overlay + sheet chrome borrows the
  PosBill button/overlay tokens (no new palette, no custom icons).
  TASK-5604: all merchant-facing labels via locale keys (EN owned here;
  TH values are EN placeholders — reed fills TH, reed-pending GAP).
  The note renders via Svelte text interpolation (escaped — XSS proof @5605).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	interface Props {
		productName: string;
		priceSat: number;
		priceText: string;
		onAdd: (detail: { modifier: string; modifierLabel: string; note: string }) => void;
		onCancel: () => void;
	}

	// Approved mockup 2/3 chip set (single-select, first = default).
	// Display labels come from locale keys (EN owned here, TH reed-pending).
	const MODIFIERS = [
		{ value: 'regular', labelKey: 'pos.popup.mod_regular' },
		{ value: 'less', labelKey: 'pos.popup.mod_less' },
		{ value: 'none', labelKey: 'pos.popup.mod_none' },
		{ value: 'shot', labelKey: 'pos.popup.mod_shot' }
	];

	let { productName, priceSat, priceText, onAdd, onCancel }: Props = $props();

	let selected = $state(MODIFIERS.length > 0 ? MODIFIERS[0].value : '');
	let note = $state('');

	function labelFor(value: string): string {
		return $_(MODIFIERS.find((c) => c.value === value)?.labelKey ?? 'pos.popup.mod_regular');
	}

	function add(): void {
		onAdd({ modifier: selected, modifierLabel: labelFor(selected), note: note.trim() });
	}
</script>

<div
	class="overlay"
	data-testid="modifier-popup"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onCancel();
	}}
>
	<div class="sheet" role="dialog" aria-label={$_('pos.popup.options_for', { values: { name: productName } })} data-testid="modifier-sheet">
		<div>
			<h3>{productName}</h3>
			<div class="sub" data-testid="popup-price">{priceText}</div>
		</div>
		<div>
			<div class="sub">{$_('pos.popup.sweetness')}</div>
			<div class="chips" data-testid="modifier-chips">
				{#each MODIFIERS as c (c.value)}
					<button
						type="button"
						class="chip"
						aria-pressed={selected === c.value}
						data-testid="modifier-chip"
						data-modifier={c.value}
						onclick={() => (selected = c.value)}
					>
						{$_(c.labelKey)}
					</button>
				{/each}
			</div>
		</div>
		<div>
			<div class="sub">{$_('pos.popup.note_label')}</div>
			<input
				class="note-input"
				data-testid="line-note-input"
				aria-label={$_('pos.popup.note_aria')}
				placeholder={$_('pos.popup.note_placeholder')}
				value={note}
				oninput={(e) => (note = (e.target as HTMLInputElement).value)}
				onkeydown={(e) => {
					if (e.key === 'Enter') add();
					if (e.key === 'Escape') onCancel();
				}}
			/>
		</div>
		<button type="button" class="btn btn-primary" data-testid="popup-add" onclick={add}>
			{$_('pos.popup.add_to_bill')} · {priceSat.toLocaleString('en-US')} SAT
		</button>
		<button type="button" class="btn btn-secondary" data-testid="popup-cancel" onclick={onCancel}>
			{$_('common.cancel')}
		</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: var(--color-overlay, rgba(0, 0, 0, 0.5));
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 400;
	}
	.sheet {
		background: var(--color-surface);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.12));
		width: 100%;
		max-width: 480px;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
	.sheet h3 {
		margin: 0;
		font-size: var(--font-size-xl);
	}
	.sub {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}
	.chip {
		min-height: 44px;
		min-width: 44px;
		padding: 8px 16px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-surface-variant);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}
	.chip[aria-pressed='true'] {
		border-color: var(--color-primary);
		background: #e0f7fa;
		font-weight: var(--font-weight-semibold);
	}
	.note-input {
		min-height: 44px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 8px 12px;
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		color: var(--color-text);
		background: var(--color-surface);
		width: 100%;
		margin-top: 4px;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		border: 1.5px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		min-height: 44px;
		font-size: var(--font-size-sm);
		padding: var(--space-sm) var(--space-md);
		width: 100%;
	}
	.btn-primary {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary);
	}
	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		border-color: var(--color-primary);
	}
	/* TASK-5607: popup slide-up/down 200ms (Commander eye rev13 fix-forward).
	   Sheet slides up 48px→0 + overlay fades in, both 200ms ease-out, pure CSS
	   (no WAAPI/svelte-transition — jsdom has no element.animate and the close
	   path stays an instant conditional unmount: close logic untouched per task,
	   so exit is instant while entrance slides. prefers-reduced-motion → off). */
	.overlay {
		animation: popup-fade-in 200ms ease-out;
	}
	.sheet {
		animation: popup-slide-up 200ms ease-out;
	}
	@keyframes popup-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes popup-slide-up {
		from {
			transform: translateY(48px);
		}
		to {
			transform: translateY(0);
		}
	}
	/* TASK-5607: prefers-reduced-motion guard — kill popup motion entirely. */
	@media (prefers-reduced-motion: reduce) {
		.overlay,
		.sheet {
			transition: none;
			animation: none;
		}
	}
</style>
