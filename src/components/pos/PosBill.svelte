<!--
  TASK-5417 R5-only — S2 cart/bill (composite §B S2 + bill-layout AFTER).
  ... (prior rev notes preserved in git history)
  TASK-5603 line-split (INTENT-056 BLUEPRINT-056 v2, approved mockup 2/3):
  - rows keyed by cart lineId (identity = product+modifier+note), NOT by
    productId: same product with different modifier/note = separate rows,
    each with its own bill stepper (inc/dec carry the lineId).
  - modifier label renders as a name suffix ("ลาเต้ร้อน · หวานปกติ"); a
    non-empty note renders an escaped note sub-row under the name
    ("หวานน้อย · หวานน้อย" = label · note, label-only row shows no
    note div). Svelte text interpolation escapes — no {@html} anywhere.
  - locks unchanged: stepper middle LOCKED 120px, total right LOCKED 80px
    right + tabular, sub parens + right ≈ (rev46), total row, CTAs.
  - legacy lines without identity fields resolve via resolveLine() (empty
    note default) so old persisted bills still render.
  Prior rev notes (R5 truth, rev29/30/43/44/46 locks) preserved in git history.
  TASK-5711 v3 bill rows (INTENT-057 BLUEPRINT v3): props.lines are now
  BillLine[] — frozen per-row snapshots from buildBill (single entry for
  the whole bill, resolved in PosApp). Subtitle shows the seller truth +
  live sats: SAT `9 SAT (…)` (truth == sats, no rate) / fiat
  `THB100.00 (3,333 SAT) (…)` (truth + live fiatToSats leg). RATE_UNAVAILABLE
  (dead rate + fiat lines) renders bill-rate-banner + blocks BOTH charge
  buttons — never invented; SAT-only carts bill rateless, never banner.
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import { countItemsText, subscribePosLocale, nativePriceText } from '$lib/pos-ui';
	import type { BillLine } from '$lib/pos/cart';

	interface Props {
		/**
		 * TASK-5711 v3 LIVE bill rows (INTENT-057 BLUEPRINT v3):
		 * frozen per-row snapshots from buildBill — PosApp resolves the
		 * whole cart against a SINGLE rate entry, so every row shows the
		 * seller truth { currency, amount } + live unitSats/lineTotalSat
		 * from the same rate (fiatToSats only, never recomputed here).
		 */
		lines: BillLine[];
		totalSat: number;
		fiatText: string;
		onInc: (id: string) => void;
		onDec: (id: string) => void;
		onChargeLn: () => void;
		onChargeCashu: () => void;
		onBack: () => void;
		/** rev43: LEFT per-row fiat (plain, NO ≈) — live-rate text from PosApp. */
		fiatLeftFor?: (sats: number) => string;
		/** rev43: RIGHT per-row fiat (WITH ≈) — live-rate text from PosApp. */
		fiatRightFor?: (sats: number) => string;
		/**
		 * TASK-5711 RATE_UNAVAILABLE (dead rate + fiat lines → buildBill
		 * failed loud): banner shows, BOTH charge buttons block (no total
		 * to charge — never invented). SAT-only carts never set this
		 * (they bill without touching the rate).
		 */
		rateUnavailable?: boolean;
	}

	let {
		lines,
		totalSat,
		fiatText,
		onInc,
		onDec,
		onChargeLn,
		onChargeCashu,
		onBack,
		fiatLeftFor,
		fiatRightFor,
		rateUnavailable = false
	}: Props = $props();

	// v3: rows arrive pre-resolved (buildBill, one entry per bill).
	// Default-identity rows carry an empty lineId → fall back to the
	// productId so legacy single-line callers keep working.
	const rowKey = (l: BillLine): string =>
		typeof l.lineId === 'string' && l.lineId.trim() !== '' ? l.lineId : l.productId;
	const rows = $derived(lines);
	const count = $derived(rows.reduce((n, l) => n + l.qty, 0));
	const empty = $derived(lines.length === 0);
	/** Seller truth text (rate-independent): SAT = live sats verbatim. */
	function truthText(l: BillLine): string {
		if (l.currency === 'SAT') return `${l.unitSats.toLocaleString('en-US')} SAT`;
		return nativePriceText(l.amount, l.currency);
	}
	// TASK-5450 rev41: total count binds to the live locale (reactive bridge).
	let posLoc = $state('en');
	$effect(() => subscribePosLocale((v) => { posLoc = v; }));
</script>

<div class="pos-screen" data-pos-screen="bill">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="bill-back" onclick={onBack} aria-label="back">
			<ArrowLeft size={24} />
		</button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.bill.title')}</Heading>
		<span class="header-spacer"></span>
	</div>

	{#if empty && !rateUnavailable}
		<p class="note" data-testid="bill-empty">{$_('pos.bill.empty')}</p>
	{:else}
		{#if rateUnavailable}
			<!-- TASK-5711: dead rate + fiat lines — fiat blocked, never
			     invented (SAT-only carts never reach this branch). -->
			<p class="rate-banner" data-testid="bill-rate-banner">{$_('pos.bill.rate_unavailable')}</p>
		{/if}
		<div class="pos-scroll" data-testid="bill-lines-scroll">
		<div class="card" style="padding:0" data-testid="bill-lines">
			{#each rows as l (rowKey(l))}
				<div class="list-item" data-testid="bill-line" data-line-for={rowKey(l)}>
					<div style="flex:1;min-width:0">
						<!-- 5603: modifier label = name suffix (note present →
						     plain name + note sub-row; legacy = plain name). -->
						<div class="list-item-title" data-testid="bill-line-name">{l.name}{(l.note ?? '') ? '' : (l.modifierLabel ?? '') ? ` · ${l.modifierLabel}` : ''}</div>
						<!-- rev46: sub = truth price + live unit SAT in PARENS only (bullet removed).
						     SAT truth shows sats verbatim (truth == sats, no rate);
						     fiat truth prefixes the seller set price, sats resolve
						     live from the single bill entry (buildBill). -->
						<div class="list-item-subtitle">{#if l.currency === 'SAT'}{l.unitSats.toLocaleString('en-US')} SAT{:else}{truthText(l)} ({l.unitSats.toLocaleString('en-US')} SAT){/if} {#if fiatLeftFor}<span data-testid="bill-line-fiat-left" data-fiat-left-for={rowKey(l)}>({fiatLeftFor(l.unitSats)})</span>{/if}</div>
						{#if (l.note ?? '')}
							<div class="line-note" data-testid="bill-line-note">{(l.modifierLabel ?? '') ? `${l.modifierLabel} · ` : ''}{l.note}</div>
						{/if}
					</div>
					<!-- rev45: stepper MIDDLE — LOCKED slim fixed width so the
					     middle x-edge is identical every row.
					     5603: keyed by lineId (per-row stepper). -->
					<div class="stepper" data-testid="bill-stepper" data-stepper-for={rowKey(l)}>
						<button type="button" data-testid="bill-dec" data-dec-for={rowKey(l)} onclick={() => onDec(rowKey(l))} aria-label="decrease">−</button>
						<span class="list-item-title stepper-qty" data-testid="bill-qty" data-qty-for={rowKey(l)}>{l.qty}</span>
						<button type="button" data-testid="bill-inc" data-inc-for={rowKey(l)} onclick={() => onInc(rowKey(l))} aria-label="increase">+</button>
					</div>
					<!-- rev45: total RIGHTMOST only (never middle) — LOCKED slim
					     fixed width + right aligned + tabular so every row's
					     right x-edge is identical for 1-digit … 7-digit totals. -->
					<div class="line-total-col" data-testid="bill-line-total-col" data-total-col-for={rowKey(l)}>
						<div class="list-item-title" data-testid="bill-line-total">{l.lineTotalSat.toLocaleString('en-US')}</div>
						{#if fiatRightFor}<div class="line-total-fiat" data-testid="bill-line-fiat-right" data-fiat-right-for={rowKey(l)}>{fiatRightFor(l.lineTotalSat)}</div>{/if}
					</div>
				</div>
			{/each}
		</div>
		</div>
	{/if}

	<!-- rev29: total + Charge/Accept sticky bottom — never lost on long bills -->
	<div class="pos-sticky-bottom" data-testid="bill-footer-sticky">
	<div class="bill-total-row" data-bill-total="r5" data-testid="bill-total">
		<div class="bill-total-label">{$_('pos.bill.total')} ({countItemsText(count, posLoc)})</div>
		<div class="bill-total-value">
			<span class="bill-total-amount" data-testid="bill-total-amount">{totalSat.toLocaleString('en-US')}</span>
			<span class="bill-total-unit">SAT</span>
			<div class="bill-total-fiat" data-testid="bill-total-fiat">{fiatText}</div>
		</div>
	</div>

	<!-- R2 bare pair — direct to checkout, no Confirm freeze.
	     TASK-5711: RATE_UNAVAILABLE blocks BOTH (no total to charge). -->
	<button
		type="button"
		class="btn btn-primary"
		data-testid="bill-charge-ln"
		disabled={empty || rateUnavailable}
		class:btn-disabled={empty || rateUnavailable}
		onclick={onChargeLn}
	>
		{$_('pos.bill.pay_ln')}
	</button>
	<button
		type="button"
		class="btn btn-secondary"
		data-testid="bill-charge-cashu"
		disabled={empty || rateUnavailable}
		class:btn-disabled={empty || rateUnavailable}
		onclick={onChargeCashu}
	>
		{$_('pos.bill.pay_cashu')}
	</button>
	</div>
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		/* rev30 scroll-height: same dvh-calc bound as catalog/manage —
		   100dvh minus app chrome (TopAppBar + BottomNav + padding/gap).
		   No fixed px height. */
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
	.header-spacer {
		width: 44px;
	}
	/* rev29 overflow: middle list scrolls, footer (total + CTAs) sticks bottom.
	   rev30 scroll-height: flex:1 + min-height:0 + overflow-y:auto;
	   overscroll contain, touch-action pan-y — NEVER none (sticky list stays
	   finger-scrollable up/down, outer page may still chain). No fixed px. */
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
	.pos-sticky-bottom {
		position: sticky;
		bottom: 0;
		z-index: 5;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		background: var(--color-background);
		padding-bottom: 2px;
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
		/* rev46 row_polish_r46: gap 4px (was var(--space-md)=16px) — middle
		   stepper hugs the right total as ONE block; locked columns keep
		   every row aligned. */
		gap: 4px;
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
	/* 5603: per-row note (escaped text, thorne XSS proof @5605) — same
	   small-secondary treatment as the subtitle. */
	.line-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* rev45 order_row_r45: stepper MIDDLE (was rightmost in rev44) — LOCKED
	   slim fixed-width container (44 + 4 + 24 + 4 + 44 = 120, narrower than
	   rev44 132) + centered so the middle x-edge aligns every row whatever
	   the qty digits; qty span fixed 24px + tabular so 1-digit … 3-digit
	   qty never shifts the buttons. Buttons stay 44px touch (Bill pattern). */
	.stepper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		flex: 0 0 120px;
		width: 120px;
		min-width: 120px;
		max-width: 120px;
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
		flex-shrink: 0;
	}
	.stepper-qty {
		flex: 0 0 24px;
		width: 24px;
		min-width: 24px;
		max-width: 24px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	/* rev46 row_polish_r46: LOCKED rightmost amount column — slim fixed
	   flex-basis 80px (was 96px) so the name flex:1 breathes; right-aligned
	   tabular-nums so the right x-edge never shifts for 1-digit … 7-digit
	   totals. */
	.line-total-col {
		flex: 0 0 80px;
		width: 80px;
		min-width: 80px;
		max-width: 80px;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-feature-settings: 'tnum';
		overflow: hidden;
		flex-shrink: 0;
	}
	.line-total-col .list-item-title {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.line-total-fiat {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-tight);
		text-align: right;
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bill-total-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-top: 1px solid var(--color-border);
	}
	.bill-total-label {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.bill-total-value {
		text-align: right;
	}
	.bill-total-amount {
		font-family: var(--font-family);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
	}
	.bill-total-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		color: var(--color-text-secondary);
	}
	.bill-total-fiat {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: right;
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
	/* TASK-5711 RATE_UNAVAILABLE: dead rate + fiat lines — fiat blocked,
	   never invented. SAT-only carts never see this (they bill rateless). */
	.rate-banner {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		background: rgba(239, 83, 80, 0.16);
		border: 1px solid rgba(239, 83, 80, 0.5);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		text-align: center;
	}
</style>
