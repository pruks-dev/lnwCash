<!--
  TASK-5424 rev28 catalog_box_wide_r28 — S1 catalog (composite §B S1 + landscape S1-land).
  rev28 truth (supersedes rev27 eye):
  - header rowline: "Catalog" + locale count badge (EN "N items" /
    TH N-items form) LEFT, Manage (Box) + History
    SOLAR icon buttons RIGHT (Icon.svelte Box + History — solar linear,
    Box = solar:box-linear verbatim api.iconify.design/solar, CC BY 4.0,
    never hand-drawn). Bottom = Bill ONLY. 44px touch on both header buttons.
  - rows: name + "200 SAT (≈ 63.00 THB)" subtitle EVERY row — price SAT +
    fiat in parens with ≈ lead, NO "· R=" suffix (L-P021: real fiat stack only).
  - per-row stepper "- qty +" verbatim Bill pattern (44px touch) — pending
    count visible incl. 0; whole card NOT clickable. NO +Add-only button.
  - Bill CTA: taller touch (56px) + locale label via billCtaText()
    (EN "Order N items T SAT (fiat)" / TH pinned order form) — NO bullets.
    (TASK-5450 rev41 manage_th_btn_r41: was EN-only "Order …".)
  - manage lives on a SEPARATE Manage page (PosManage.svelte) — nothing inline.
  - WIDE ≥640px: single column, max-width 480 centered — NO 1fr 1fr split.
    portrait/landscape identical grid; stepper never breaks.
  - TASK-5443 rev37 catalog_header_th_r37: header "Catalog" h3 20px → h2 24px
    (= every other PoS page) via central Heading level h2 align center —
    EN/TH pin untouched (reed 5442 owns TH translation, L-T015).
  - TASK-5426 rev29 back_overflow_r29: list scrolls middle (.pos-scroll) +
    Bill CTA sticky bottom (button stays direct child, position sticky) —
    long catalogs never bury the Bill button.
  - TASK-5428 rev30 scroll_height_r30: .pos-screen bounded by dvh-calc
    (100dvh - TopAppBar - BottomNav - screen chrome) so .pos-scroll
    flex:1/min-height:0 resolves to (screen - rowline - footer - gaps);
    overscroll contain, touch-action pan-y (never none — list stays
    finger-scrollable up/down, outer page can still chain).
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Icon from '$lib/components/icons/Icon.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import { countItemsText, billCtaText, subscribePosLocale } from '$lib/pos-ui';
	import type { PosProduct } from '$lib/pos/catalog';

	interface Props {
		products: PosProduct[];
		fiatFor: (priceSat: number) => string;
		cartCount: number;
		cartTotalSat: number;
		cartFiat: string;
		qtyFor: (id: string) => number;
		onInc: (id: string) => void;
		onDec: (id: string) => void;
		onOpenBill: () => void;
		onOpenManage: () => void;
		onOpenHistory: () => void;
	}

	let {
		products,
		fiatFor,
		cartCount,
		cartTotalSat,
		cartFiat,
		qtyFor,
		onInc,
		onDec,
		onOpenBill,
		onOpenManage,
		onOpenHistory
	}: Props = $props();
	// TASK-5450 rev41: count badge + Bill CTA bind to the live locale
	// (EN items-form / TH items-form), no bullets.
	// posLoc is reactive (subscribe bridge) so a language switch re-renders
	// with the right language — a one-shot read would go stale.
	let posLoc = $state('en');
	$effect(() => subscribePosLocale((v) => { posLoc = v; }));
</script>

<div class="pos-screen" data-pos-screen="catalog">
	<div class="rowline">
		<span class="rowline-left">
			<!-- TASK-5443 rev37 catalog_header_th_r37: h2 24px = other pages (was h3 20px) -->
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

	<!-- rev28: single column at EVERY width — max-width 480 centered, no 2-col split -->
	<!-- rev29: grid scrolls middle; Bill CTA (direct child) sticks bottom -->
	<div class="pos-scroll" data-testid="catalog-list-scroll">
	<div class="pos-catalog-grid" data-testid="catalog-grid">
		{#each products as p (p.id)}
			<div class="card pos-row-card" data-testid="catalog-row" data-product-id={p.id}>
				<div class="list-item">
					<div style="flex:1;min-width:0">
						<div class="list-item-title">{p.name}</div>
						<div class="list-item-subtitle" data-testid="catalog-fiat" data-fiat-for={p.id}>
							{p.priceSat.toLocaleString('en-US')} SAT ({fiatFor(p.priceSat)})
						</div>
					</div>
					<div class="stepper">
						<button
							type="button"
							data-testid="catalog-dec"
							data-dec-for={p.id}
							onclick={() => onDec(p.id)}
							aria-label="decrease"
						>−</button>
						<span
							class="list-item-title"
							data-testid="catalog-qty"
							data-qty-for={p.id}>{qtyFor(p.id)}</span>
						<button
							type="button"
							data-testid="catalog-inc"
							data-inc-for={p.id}
							onclick={() => onInc(p.id)}
							aria-label="increase"
						>+</button>
					</div>
				</div>
			</div>
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
		max-width: 480px;
		margin: 0 auto;
		/* rev30 scroll-height: bound screen to viewport minus app chrome
		   (TopAppBar + BottomNav + screen padding/gap reserves) via dvh-calc
		   ONLY — no fixed px height. .pos-scroll flex:1 then resolves to
		   (screen - rowline - sticky footer - gaps) and scrolls middle. */
		height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		max-height: calc(100dvh - var(--pos-topbar-h, 64px) - var(--pos-bottomnav-h, 80px) - var(--pos-screen-chrome-pad, 32px));
		min-height: 0;
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
	/* TASK-5443 rev37: catalog title is the central Heading h2 24px (was h3 20px). */
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
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: var(--space-md);
	}
	.pos-row-card {
		padding: 0;
	}
	.list-item {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		min-height: 48px;
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
	/* stepper verbatim Bill pattern — 44px touch targets */
	.stepper {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	.stepper button {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-surface-variant);
		color: var(--color-text);
		font-size: 18px;
	}
	.stepper span {
		min-width: 24px;
		text-align: center;
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
	/* rev27: Bill CTA taller touch (56px) — sole bottom button */
	.catalog-bill {
		min-height: 56px;
		font-size: var(--font-size-md);
		/* rev29: sticky bottom — direct child kept (sole bottom button contract) */
		position: sticky;
		bottom: 0;
		z-index: 5;
		flex-shrink: 0;
	}
	/* rev29 overflow: middle list scrolls, Bill CTA sticks bottom.
	   rev30 scroll-height: flex:1 + min-height:0 + overflow-y:auto inside the
	   dvh-bounded .pos-screen; overscroll contain (outer page may still chain),
	   touch-action pan-y — NEVER none, so the sticky list stays
	   finger-scrollable up/down. No fixed px height — dvh-calc only. */
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
	.pos-catalog-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-md);
	}
	/* rev28: ≥640px keeps the single column (max-width 480 centered on .pos-screen).
	   No 1fr 1fr split — portrait/landscape identical, stepper never breaks. */
	@media (min-width: 640px) {
		.pos-catalog-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
