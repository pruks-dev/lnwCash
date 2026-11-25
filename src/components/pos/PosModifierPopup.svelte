<!--
  TASK-5603 — PosModifierPopup (INTENT-056 BLUEPRINT-056 v2, approved mockup 2/3).
  Sheet after tapping a catalog card: modifier chips (single-select) + a
  per-row note input → Add appends a SEPARATE bill row (identity =
  product+modifier+note, cart.ts). Overlay + sheet chrome borrows the
  PosBill button/overlay tokens (no new palette, no custom icons).
  TASK-5604: all merchant-facing labels via locale keys (EN owned here;
  TH values are EN placeholders — reed fills TH, reed-pending GAP).
  TASK-5702-R10 (INTENT-057 BLUEPRINT v3 rev23 Commander ORDER):
  presets-only offers, note-always. The popup opens for EVERY tap;
  chips = seller strings verbatim when presets exist, NO chips section
  at all when presets are empty (note-only — rev22 skip superseded).
  Section heading is the generic pos.popup.options (Options, reed
  TASK-5708). onAdd shape unchanged (bounded scope).
  TASK-5702-R11 (INTENT-057 BLUEPRINT v3 rev24 Commander ORDER):
  Add button drops the middle dot and the SAT-only leg -- it renders
  the existing pos.popup.add_to_bill key + ONE space + priceText
  verbatim (catalogPriceText pair, e.g. THB65 (≈ ... SAT)).
  No new i18n key.
  The note renders via Svelte text interpolation (escaped — XSS proof @5605).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	interface Props {
		productName: string;
		// TASK-5702 shared migration (5711 owns formulas): v3 truth products
		// resolve display sats live in PosApp — null = dead-rate fiat leg
		// ('– SAT', never fabricated).
		// TASK-5702-R11 rev24: retained for API compat (PosApp still passes
		// it) — NO LONGER RENDERED. The button shows priceText verbatim.
		priceSat?: number | null;
		priceText: string;
		/**
		 * TASK-5702-R10 note-only (INTENT-057 BLUEPRINT v3 rev23,
		 * Commander ORDER "no presets shows note-only, no skip").
		 * Empty presets is VALID: chips section hides, note stays -- Add
		 * yields modifier '' + typed note (same bare identity as cart).
		 * No central fallback -- chips are seller strings verbatim.
		 * onAdd shape untouched so cart identity (product+modifier+note)
		 * and bill/checkout are unaffected -- bounded to popup offer list.
		 */
		presets?: string[];
		onAdd: (detail: { modifier: string; modifierLabel: string; note: string }) => void;
		onCancel: () => void;
	}

	// R10 rev23 note-only: no central set — chips come from the presets
	// prop (seller strings). Empty presets => chips section hides,
	// note-only popup stays open (rev22 skip superseded).

	let { productName, priceText, presets = [], onAdd, onCancel }: Props = $props();

	// R10 rev23: offer list IS the presets (verbatim seller copy, no fallback).
	const chips = $derived<string[]>([...presets]);

	let selected = $state('');
	// Effective pick — first offered chip by default (fresh per product
	// since the popup remounts on every open); keeps the tap only if offered.
	const current = $derived(selected && chips.includes(selected) ? selected : (chips[0] ?? ''));
	let note = $state('');

	function labelFor(value: string): string {
		return value;
	}

	function add(): void {
		onAdd({ modifier: current, modifierLabel: labelFor(current), note: note.trim() });
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
		{#if chips.length > 0}
			<div>
				<div class="sub">{$_('pos.popup.options')}</div>
				<div class="chips" data-testid="modifier-chips">
					{#each chips as v (v)}
						<button
							type="button"
							class="chip"
							aria-pressed={current === v}
							data-testid="modifier-chip"
							data-modifier={v}
							onclick={() => (selected = v)}
						>
							{labelFor(v)}
						</button>
					{/each}
				</div>
			</div>
		{/if}
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
			{$_('pos.popup.add_to_bill')} {priceText}
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
