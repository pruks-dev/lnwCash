<!--
  TASK-5417 R5-only — S2 cart/bill (composite §B S2 + bill-layout AFTER).
  R5 truth (rev12+rev13):
  - lines → total RIGHT receipt row (space-between) → R2 bare pair
  - bare pair: primary "Pay via Lightning" + secondary "Pay via Cashu"
    (no Card/pills/lg/captions)
    (TASK-5450 rev41: labels locale via pos.bill.pay_ln/pay_cashu —
    EN "Pay via …" / TH pay-via form; total label locale
    EN "Total (N items)" / TH total-form — no bullets anywhere)
  - steppers 44px, back 44px, empty bill → CTAs DISABLED (.5) (DEV-2 fix)
  - Charge/Accept go DIRECT to checkout — no Confirm freeze (DEV-3 fix)
  - TASK-5426 rev29 back_overflow_r29: back = ArrowLeft size 24 verbatim
    wallet (Receive/Send/Settings/TopAppBar) — 44px circle surface-variant
    kept, SVG only; lines scroll middle (.pos-scroll) + total + Charge/Accept
    sticky bottom (.pos-sticky-bottom) — total+CTAs never lost on long bills.
  TASK-5428 rev30 scroll_height_r30: same dvh-calc screen bound as catalog/
  manage (.pos-screen = 100dvh - TopAppBar - BottomNav - chrome);
  .pos-scroll flex:1/min-height:0/overflow-y:auto, overscroll contain,
  touch-action pan-y (never none — list stays finger-scrollable).
  TASK-5454 rev43 order_fix_r43 — Order (bill) fixforward:
  - stepper-aligned: right amount column LOCKED fixed width (flex 0 0 120px)
    + text-align right + tabular-nums → any digit count keeps the middle
    stepper x-position identical every row.
  - per-row fiat: LEFT subtitle = plain fiat via formatFiat (NO ≈, e.g.
    "63.00 THB"); RIGHT column = fiatRowText form (WITH ≈, e.g. "≈ 63.00 THB").
    Both arrive as props (fiatLeftFor/fiatRightFor) from PosApp live rate —
    this component never touches rates/snapshot (read-only display).
  - total stays live: fiatText prop is ALWAYS the live-rate text from PosApp
    (bill snapshot never consulted — see PosApp billFiat live-only).
  TASK-5456 rev44 stepper_right_r44 — Order (bill) row reorder ONLY:
  - row shape: ชื่อ | ยอดกลาง | stepper ขวาสุด (was ชื่อ | stepper | ยอดขวา).
    Middle amount column LOCKED (flex 0 0 120px + right + tabular-nums) +
    stepper container LOCKED fixed width (flex 0 0 132px + justify flex-end,
    qty span fixed 28px + tabular) → every row's middle col + right stepper
    share identical x-edges at any digit count. Stepper stays RIGHTMOST only
    (never left); catalog untouched.
  TASK-5460 rev46 row_polish_r46 — Order (bill) row polish (SUPERSEDES rev45 shape, keeps rev45 order):
  - row shape UNCHANGED: ชื่อ | stepper กลาง | ยอดขวาสุด (total col still LAST
    child, stepper still middle — rev45 order pins hold).
  - sub = "200 SAT (63.00 THB)" (middle-dot bullet REMOVED) — unit SAT +
    left fiat in PARENS only, never a bullet separator. Left fiat stays plain
    NO ≈ via fiatLeftFor; parens are the ONLY separator.
  - ขวากระชับ: right total col LOCKED slim flex 0 0 80px (was 96px) + right +
    tabular-nums — 16px given back to the name flex:1; 1-digit … 7-digit
    totals keep the identical right x-edge every row.
  - กลางชิดขวา: .list-item gap var(--space-md)=16px → 4px so the middle
    stepper hugs the right total as ONE block (stepper interior gap was
    already 4px); locked columns keep every row aligned, never messy.
    Stepper container stays LOCKED flex 0 0 120px (44+4+24+4+44, qty 24px +
    tabular); buttons stay 44px touch; catalog untouched.
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import { countItemsText, subscribePosLocale } from '$lib/pos-ui';
	import type { CartLine } from '$lib/pos/cart';

	interface Props {
		lines: CartLine[];
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
		fiatRightFor
	}: Props = $props();

	const count = $derived(lines.reduce((n, l) => n + l.qty, 0));
	const empty = $derived(lines.length === 0);
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

	{#if empty}
		<p class="note" data-testid="bill-empty">{$_('pos.bill.empty')}</p>
	{:else}
		<div class="pos-scroll" data-testid="bill-lines-scroll">
		<div class="card" style="padding:0" data-testid="bill-lines">
			{#each lines as l (l.productId)}
				<div class="list-item" data-testid="bill-line" data-line-for={l.productId}>
					<div style="flex:1;min-width:0">
						<!-- rev45: head = name ONLY (no × n — qty lives on the stepper). -->
						<div class="list-item-title" data-testid="bill-line-name">{l.name}</div>
						<!-- rev46: sub = unit SAT + left fiat in PARENS only (bullet removed). -->
						<div class="list-item-subtitle">{l.unitPriceSat.toLocaleString('en-US')} SAT {#if fiatLeftFor}<span data-testid="bill-line-fiat-left" data-fiat-left-for={l.productId}>({fiatLeftFor(l.unitPriceSat)})</span>{/if}</div>
					</div>
					<!-- rev45: stepper MIDDLE (was rightmost in rev44) — LOCKED
					     slim fixed width so the middle x-edge is identical
					     every row. -->
					<div class="stepper" data-testid="bill-stepper" data-stepper-for={l.productId}>
						<button type="button" data-testid="bill-dec" data-dec-for={l.productId} onclick={() => onDec(l.productId)} aria-label="decrease">−</button>
						<span class="list-item-title stepper-qty" data-testid="bill-qty" data-qty-for={l.productId}>{l.qty}</span>
						<button type="button" data-testid="bill-inc" data-inc-for={l.productId} onclick={() => onInc(l.productId)} aria-label="increase">+</button>
					</div>
					<!-- rev45: total RIGHTMOST only (never middle) — LOCKED slim
					     fixed width + right aligned + tabular so every row's
					     right x-edge is identical for 1-digit … 7-digit totals. -->
					<div class="line-total-col" data-testid="bill-line-total-col" data-total-col-for={l.productId}>
						<div class="list-item-title" data-testid="bill-line-total">{l.lineTotalSat.toLocaleString('en-US')}</div>
						{#if fiatRightFor}<div class="line-total-fiat" data-testid="bill-line-fiat-right" data-fiat-right-for={l.productId}>{fiatRightFor(l.lineTotalSat)}</div>{/if}
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

	<!-- R2 bare pair — direct to checkout, no Confirm freeze -->
	<button
		type="button"
		class="btn btn-primary"
		data-testid="bill-charge-ln"
		disabled={empty}
		class:btn-disabled={empty}
		onclick={onChargeLn}
	>
		{$_('pos.bill.pay_ln')}
	</button>
	<button
		type="button"
		class="btn btn-secondary"
		data-testid="bill-charge-cashu"
		disabled={empty}
		class:btn-disabled={empty}
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
</style>
