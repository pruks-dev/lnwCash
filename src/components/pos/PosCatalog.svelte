<!--
  TASK-5603 grid catalog (INTENT-056 BLUEPRINT-056 v2, approved mockup 1/3 R2).
  Supersedes the rev28 single-column + per-card stepper truth:
  - grid: <640px 2 cols / ≥640px 3 cols / ≥1024px 4 cols (no 1fr single-col
    anywhere; portrait/landscape identical — media queries only, no JS).
  - card = photo (pos-images IndexedDB via ProductPhoto, solar Box fallback)
    + name + price. NO stepper on the card — tap the card → modifier+note
    popup (parent owns it); qty is adjusted on the bill stepper.
  - price: SAT-priced `200 SAT (≈ 63.00 THB)` (SAT first, converted leg in
    parens via fiatRowText) / HEAVY native `฿45.00 (≈ 143 SAT)` (native
    first, SAT leg in parens) — both legs from the fiat stack, no rate
    math here (priceFor prop, built by PosApp).
  - header (h2 24px + count badge + Box/History solar 44px) + Bill CTA 56px
    sticky stay byte-identical to the old truth.
  - frame: .pos-screen phone 480 centered → ≥640px 720 → ≥1024px 960
    (TASK-5604 wide frame, approved mockup 3/3 R4 — grid breakpoints unchanged).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Icon from '$lib/components/icons/Icon.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import { countItemsText, billCtaText, subscribePosLocale } from '$lib/pos-ui';
	import type { PosProduct } from '$lib/pos/catalog';
	import ProductPhoto from './ProductPhoto.svelte';

	interface Props {
		products: PosProduct[];
		/** Approved price text per product (SAT-first or native-first). */
		priceFor: (p: PosProduct) => string;
		cartCount: number;
		cartTotalSat: number;
		cartFiat: string;
		/** Tap a card → parent opens the modifier+note popup. */
		onSelect: (id: string) => void;
		onOpenBill: () => void;
		onOpenManage: () => void;
		onOpenHistory: () => void;
		/**
		 * Legacy SAT-leg fallback (pre-5603 callers/tests): used only when
		 * priceFor is absent. PosApp always passes priceFor.
		 */
		fiatFor?: (priceSat: number) => string;
	}

	let {
		products,
		priceFor,
		cartCount,
		cartTotalSat,
		cartFiat,
		onSelect,
		onOpenBill,
		onOpenManage,
		onOpenHistory,
		fiatFor
	}: Props = $props();
	// TASK-5450 rev41: count badge + Bill CTA bind to the live locale
	// (EN items-form / TH items-form), no bullets.
	let posLoc = $state('en');
	$effect(() => subscribePosLocale((v) => { posLoc = v; }));

	function subtitle(p: PosProduct): string {
		if (priceFor) return priceFor(p);
		const fiat = fiatFor ? fiatFor(p.priceSat) : '';
		return `${p.priceSat.toLocaleString('en-US')} SAT (${fiat})`;
	}
</script>

<div class="pos-screen" data-pos-screen="catalog">
	<div class="rowline">
		<span class="rowline-left">
			<!-- TASK-5443 rev37 catalog_header_th_r37: h2 24px = other pages -->
			<Heading level="h2" align="center" truncate>{$_('pos.catalog.title')}</Heading>
			<span class="status-badge" data-testid="catalog-count">{countItemsText(products.length, posLoc)}</span>
		</span>
		<span class="head-actions">
			<button
				type="button"
				class="icon-btn"
				data-testid="catalog-open-manage"
				aria-label={$_('pos.catalog.manage')}
				onclick={onOpenManage}
			>
				<Icon name="Box" size={24} />
			</button>
			<button
				type="button"
				class="icon-btn"
				data-testid="catalog-open-history"
				aria-label={$_('pos.history.title')}
				onclick={onOpenHistory}
			>
				<Icon name="History" size={24} />
			</button>
		</span>
	</div>

	{#if products.length === 0}
		<p class="note" data-testid="catalog-empty">{$_('pos.catalog.empty')}</p>
	{/if}

	<!-- 5603: grid scrolls middle; Bill CTA (direct child) sticks bottom -->
	<div class="pos-scroll" data-testid="catalog-list-scroll">
	<div class="pos-catalog-grid" data-testid="catalog-grid">
		{#each products as p (p.id)}
			<button
				type="button"
				class="card"
				data-testid="catalog-row"
				data-product-id={p.id}
				aria-label={$_('pos.catalog.tap_to_customize', { values: { name: p.name } })}
				onclick={() => onSelect(p.id)}
			>
				<ProductPhoto productId={p.id} alt={p.name} />
				<span class="card-body">
					<span class="list-item-title">{p.name}</span>
					<span class="list-item-subtitle" data-testid="catalog-fiat" data-fiat-for={p.id}>
						{subtitle(p)}
					</span>
				</span>
			</button>
		{/each}
	</div>
	</div>

	<button
		type="button"
		class="btn btn-primary catalog-bill"
		data-testid="catalog-bill"
		disabled={cartCount === 0}
		class:btn-disabled={cartCount === 0}
		onclick={onOpenBill}
	>
		{billCtaText(cartCount, cartTotalSat, cartFiat, posLoc)}
	</button>
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
		/* 5603: frame UNCHANGED — 480 centered (TASK-5604 owns 720/960). */
		max-width: 480px;
		margin: 0 auto;
		/* rev30 scroll-height: bound screen to viewport minus app chrome
		   via dvh-calc ONLY. .pos-scroll flex:1 then resolves to
		   (screen - rowline - sticky footer - gaps) and scrolls middle. */
		height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		max-height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		min-height: 0;
	}
	/* TASK-5604 wide frame (approved mockup 3/3 R4): phone 480 → ≥640px 720 → ≥1024px 960, pos-only. */
	@media (min-width: 640px) {
		.pos-screen {
			max-width: 720px;
		}
	}
	@media (min-width: 1024px) {
		.pos-screen {
			max-width: 960px;
		}
	}
	.rowline {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	.rowline-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
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
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
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
	/* 5603 card: tappable (whole card = one 44px+ target), photo 4:3 +
	   name + price. Card chrome (surface/border/radius-16/shadow-sm/
	   padding-16) pixel-identical to the approved mockup. */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: var(--space-md);
		cursor: pointer;
		font-family: var(--font-family);
		text-align: start;
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 44px;
		/* TASK-5608 narrow fix (Commander eye rev14): grid item must shrink
		   below content min-width — bare 1fr (= minmax(auto,1fr)) + nowrap
		   title/subtitle forced unequal cols <420-430px. min-width:0 lets
		   the minmax(0,1fr) tracks below stay equal. */
		min-width: 0;
	}
	.card:active {
		border-color: var(--color-primary);
	}
	.card-body {
		padding-top: 8px;
		display: flex;
		flex-direction: column;
		min-width: 0;
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
	.catalog-bill {
		min-height: 56px;
		font-size: var(--font-size-md);
		position: sticky;
		bottom: 0;
		z-index: 5;
		flex-shrink: 0;
	}
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
	.btn:disabled,
	.btn-disabled {
		opacity: 0.5;
	}
	.btn:disabled {
		cursor: not-allowed;
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
	/* 5603 grid (approved mockup 1/3 R2): narrow 2 / ≥640px 3 / ≥1024px 4.
	   No 1fr single-col anywhere.
	   TASK-5608 narrow fix (Commander eye rev14): bare `1fr` means
	   minmax(auto,1fr) — content min-width (nowrap title/subtitle) pushes
	   tracks unequal <420-430px. minmax(0,1fr) + .card min-width:0 keeps
	   left/right cols equal at 360/390. */
	.pos-catalog-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	@media (min-width: 640px) {
		.pos-catalog-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) {
		.pos-catalog-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
