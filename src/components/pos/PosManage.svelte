<!--
  TASK-5422 rev27 catalog-eye — Manage page (SEPARATE screen, never inline).
  Entered from the catalog header Manage solar icon; back returns to catalog.
  One row per product (INCLUDING off-sale — dimmed with state badge):
  - name + "200 SAT (≈ 63.00 THB)" subtitle (same row format as catalog)
  - state badge On sale / Off sale (pos.catalog.on_sale / off_sale — EN kept
    in TH, translator pending, L-T015)
  - toggle button flips sale on/off (aria-pressed) — row stays in catalog
  - Remove hard-deletes (never-sold mistakes only; sales log keeps its lines)
  Add-product form lives in a bottom SHEET (Modal variant="bottomsheet"),
  opened by the header + button (solar:add-circle-linear AddCircle, pinned
  verbatim api.iconify.design/solar, CC BY 4.0, never hand-drawn).
  All icons: none hand-drawn — solar Icon.svelte + R5 typography only.
  TASK-5426 rev29 back_overflow_r29: back = ArrowLeft size 24 verbatim
  wallet — 44px circle kept; list scrolls middle (.pos-scroll).
  TASK-5428 rev30 scroll_height_r30: same dvh-calc screen bound as catalog/
  bill (.pos-screen = 100dvh - TopAppBar - BottomNav - chrome);
  .pos-scroll flex:1/min-height:0/overflow-y:auto, overscroll contain,
  touch-action pan-y (never none — list stays finger-scrollable).
  TASK-5464 rev48 addcard_fiat_r48 — add Card: centered Card + unit switch
  SAT/fiat + live preview + prominent Save (btn-primary). Price LIGHT:
  fiat input → fiatToSats (convert.ts, read-only reuse) → store priceSat.
  TASK-5466 rev49 fixforward_bottomsheet_r49 — add Card MOVED into the
  bottom sheet (sheet + header + button, title = pos.catalog.add_product
  pinned locale, single source in the sheet header). Save/error/preview/
  unit-switch markup + money wiring UNCHANGED (read-only reuse only);
  sheet closes on explicit close (X/backdrop/Escape), stays open after a
  successful save so the next item can be added. Money logic 0 diff.
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import type { PosProduct } from '$lib/pos/catalog';
	import { fiatToSats } from '$lib/fiat/convert';
	import { formatFiat } from '$lib/fiat/currency';
	import type { FiatCurrency } from '$lib/fiat/rates';

	export type ManagePriceMode = 'sat' | 'fiat';

	interface Props {
		items: PosProduct[];
		fiatFor: (priceSat: number) => string;
		newName: string;
		newPrice: string;
		manageError: string;
		onNewName: (v: string) => void;
		onNewPrice: (v: string) => void;
		onAddProduct: () => void;
		onRemoveProduct: (id: string) => void;
		onToggleActive: (id: string) => void;
		onBack: () => void;
		/** rev48: SAT/fiat unit switch (default SAT — old callers unaffected). */
		priceMode?: ManagePriceMode;
		onPriceMode?: (m: ManagePriceMode) => void;
		/** rev48: live rate for the preview (read-only, never fetched here). */
		rateCurrency?: FiatCurrency;
		ratePrice?: number | null;
	}

	let {
		items,
		fiatFor,
		newName,
		newPrice,
		manageError,
		onNewName,
		onNewPrice,
		onAddProduct,
		onRemoveProduct,
		onToggleActive,
		onBack,
		priceMode = 'sat',
		onPriceMode = () => {},
		rateCurrency = 'THB',
		ratePrice = null
	}: Props = $props();

	// rev49 bottom-sheet: presentation-only open state. Money wiring
	// (fiatToSats/formatFiat + parent save) is untouched — the sheet only
	// re-homes the rev48 add Card. Closes on explicit close (Modal X /
	// backdrop / Escape); stays open after a successful save for the next
	// item.
	let addOpen = $state(false);

	// rev48 live preview — READ-ONLY reuse of fiat stack (convert.ts floor +
	// dust-block + currency.ts format; this file never invents a rate).
	// Empty/invalid input → no preview (save surfaces the error instead).
	const previewText = $derived.by((): string => {
		const raw = newPrice.trim();
		if (raw.length === 0) return '';
		if (priceMode === 'fiat') {
			const r = fiatToSats(raw, rateCurrency, ratePrice);
			if (!r.ok) {
				// Rate gone → unavailable badge (never fabricated).
				// Parse errors → silent (save shows the message).
				if (r.code === 'RATE_UNAVAILABLE') return `– ${rateCurrency}`;
				return '';
			}
			return `≈ ${r.sats.toLocaleString('en-US')} SAT`;
		}
		const n = Number(raw);
		if (!Number.isInteger(n) || n <= 0) return '';
		if (typeof ratePrice !== 'number' || !Number.isFinite(ratePrice) || ratePrice <= 0) {
			return `– ${rateCurrency}`;
		}
		return `≈ ${formatFiat(n, ratePrice, rateCurrency)}`;
	});
</script>

<div class="pos-screen" data-pos-screen="manage">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="manage-back" onclick={onBack} aria-label="back">
			<ArrowLeft size={24} />
		</button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.catalog.manage')}</Heading>
		<!-- rev49: header + button opens the add bottom-sheet (solar
		     AddCircle, 24px in a 44px touch target, aria = pinned
		     pos.catalog.add_product — no new locale keys, L-T015). -->
		<button
			type="button"
			class="icon-btn"
			data-testid="manage-open-add"
			aria-label={$_('pos.catalog.add_product')}
			onclick={() => (addOpen = true)}
		>
			<Icon name="AddCircle" size={24} />
		</button>
	</div>

	{#if items.length === 0}
		<p class="note" data-testid="manage-empty">{$_('pos.catalog.empty')}</p>
	{:else}
		<div class="pos-scroll" data-testid="manage-list-scroll">
		<div class="card" style="padding:0" data-testid="manage-list">
			{#each items as p (p.id)}
				<div
					class="list-item"
					class:off-sale={!p.active}
					data-testid="manage-row"
					data-product-id={p.id}
					data-active={p.active}
				>
					<div style="flex:1;min-width:0">
						<div class="list-item-title">{p.name}</div>
						<div class="list-item-subtitle" data-testid="manage-fiat" data-fiat-for={p.id}>
							{p.priceSat.toLocaleString('en-US')} SAT ({fiatFor(p.priceSat)})
						</div>
					</div>
					<span
						class="status-badge"
						class:badge-off={!p.active}
						data-testid="manage-state"
						data-state-for={p.id}
					>
						{p.active ? $_('pos.catalog.on_sale') : $_('pos.catalog.off_sale')}
					</span>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						style="width:auto"
						data-testid="manage-toggle"
						data-toggle-for={p.id}
						aria-pressed={p.active}
						onclick={() => onToggleActive(p.id)}
					>
						{p.active ? $_('pos.catalog.off_sale') : $_('pos.catalog.on_sale')}
					</button>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						style="width:auto"
						data-testid="manage-remove"
						data-remove-for={p.id}
						onclick={() => onRemoveProduct(p.id)}
					>
						{$_('pos.catalog.remove')}
					</button>
				</div>
			{/each}
		</div>
		</div>
	{/if}

	<!-- rev49: add form lives in the bottom sheet (Modal bottomsheet
	     variant slides up, theme tokens only). The rev48 Card markup +
	     testids + money wiring inside are UNCHANGED — only re-homed.
	     Sheet title = pinned pos.catalog.add_product (single source, so
	     the old in-card title line is gone). Explicit close only. -->
	<Modal
		open={addOpen}
		onclose={() => (addOpen = false)}
		variant="bottomsheet"
		title={$_('pos.catalog.add_product')}
	>
		<div class="card add-card" data-testid="manage-add">
			<div class="unit-switch" role="group" aria-label="price unit" data-testid="manage-unit-switch">
				<button
					type="button"
					class="unit-btn"
					class:unit-on={priceMode === 'sat'}
					data-testid="manage-mode-sat"
					aria-pressed={priceMode === 'sat'}
					onclick={() => onPriceMode('sat')}
				>
					SAT
				</button>
				<button
					type="button"
					class="unit-btn"
					class:unit-on={priceMode === 'fiat'}
					data-testid="manage-mode-fiat"
					aria-pressed={priceMode === 'fiat'}
					onclick={() => onPriceMode('fiat')}
				>
					{rateCurrency}
				</button>
			</div>
			<label class="pos-field">
				<span>{$_('pos.catalog.product_name')}</span>
				<input
					type="text"
					value={newName}
					data-testid="manage-name"
					oninput={(e) => onNewName((e.target as HTMLInputElement).value)}
				/>
			</label>
			{#if priceMode === 'fiat'}
				<label class="pos-field">
					<span>Price ({rateCurrency})</span>
					<input
						type="text"
						inputmode="decimal"
						value={newPrice}
						data-testid="manage-price"
						oninput={(e) => onNewPrice((e.target as HTMLInputElement).value)}
					/>
				</label>
			{:else}
				<label class="pos-field">
					<span>{$_('pos.catalog.product_price')}</span>
					<input
						type="number"
						min="1"
						step="1"
						value={newPrice}
						data-testid="manage-price"
						oninput={(e) => onNewPrice((e.target as HTMLInputElement).value)}
					/>
				</label>
			{/if}
			{#if previewText}
				<p class="preview" data-testid="manage-preview">{previewText}</p>
			{/if}
			{#if manageError}
				<p class="pos-error" data-testid="manage-error">{manageError}</p>
			{/if}
			<button
				type="button"
				class="btn btn-primary add-save"
				data-testid="manage-save"
				onclick={() => onAddProduct()}
			>
				{$_('pos.catalog.save')}
			</button>
		</div>
	</Modal>
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		/* rev30 scroll-height: same dvh-calc bound as catalog/bill —
		   100dvh minus app chrome (TopAppBar + BottomNav + padding/gap).
		   No fixed px height. */
		height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		max-height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		min-height: 0;
	}
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		flex-shrink: 0;
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
		flex-shrink: 0;
		font-size: 18px;
	}
	/* rev49: header + button — same 44px touch target as the catalog
	   header icon buttons (Box/History pattern), theme tokens only. */
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		-webkit-tap-highlight-color: transparent;
		flex-shrink: 0;
	}
	/* rev30 scroll-height: flex:1 + min-height:0 + overflow-y:auto;
	   overscroll contain, touch-action pan-y — NEVER none (list stays
	   finger-scrollable up/down, outer page may still chain). No fixed px.
	   rev49: list keeps the middle scroll; the add form moved to the sheet. */
	.pos-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		touch-action: pan-y;
		-webkit-overflow-scrolling: touch;
		scrollbar-gutter: stable;
	}
	/* TASK-5440 rev36: Heading owns the middle stretch (truncate-safe). */
	.top-bar :global(h2) {
		flex: 1;
		min-width: 0;
	}
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: var(--space-md);
	}
	.list-item {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		min-height: 48px;
	}
	.list-item.off-sale {
		opacity: 0.65;
	}
	.list-item-title {
		font-size: var(--font-size-md);
		color: var(--color-text);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-item-subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-badge {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}
	.badge-off {
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
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
		flex-shrink: 0;
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
	.btn-ghost {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
	}
	.btn-sm {
		font-size: var(--font-size-xs);
		border-radius: var(--radius-sm);
		min-height: 44px;
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
	.pos-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--font-size-sm);
		margin-top: var(--space-sm);
	}
	.pos-field input {
		min-height: 44px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-md);
	}
	.pos-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		text-align: center;
	}
	/* rev48 addcard_fiat: centered Card — switch + preview centered,
	   comfortable gaps, prominent full-width Save. rev49: the Card lives
	   inside the bottom sheet (Modal bottomsheet, max-width 480) — the
	   Card keeps its own max-width 400 + margin auto centering so the
	   portrait/landscape rhythm is unchanged. List styles above untouched.
	   Sheet title lives in the Modal header (single pinned source). */
	.add-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		align-items: stretch;
		max-width: 400px;
		margin: 0 auto;
		width: 100%;
	}
	.unit-switch {
		display: flex;
		justify-content: center;
		gap: var(--space-sm);
	}
	.unit-btn {
		min-height: 44px;
		min-width: 88px;
		padding: 0 var(--space-md);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-sm);
	}
	.unit-btn.unit-on {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-primary-contrast);
	}
	.preview {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		text-align: center;
	}
	.add-save {
		margin-top: var(--space-sm);
		min-height: 48px;
		font-size: var(--font-size-md);
	}
</style>
