<!--
  TASK-5417 R5-only — S5 paid-success (composite §B S5 + landscape S5-land).
  R5 truth:
  - pills Paid + method (LN/Cashu) above 48px amount (DEV F3 carries forward)
  - "New sale" primary button (DEV-6 fix — NOT Back-to-bill)
  - tab-bar All/Lightning/Cashu filter (DEV-7 fix — ON Success per R5)
  - Today card + list rows (Today, N sales, total + method pills)
  - sale persisted FIRST (write-before-show) — this screen only renders a stored record
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import type { SaleRecord } from '$lib/pos/sales-log';
	import { resolveLine } from '$lib/pos/cart';
	import type { PosFilter } from '$lib/pos-ui';

	interface Props {
		sale: SaleRecord;
		filter: PosFilter;
		onFilter: (f: PosFilter) => void;
		todayCount: number;
		todayTotalSat: number;
		visibleSales: SaleRecord[];
		onNewSale: () => void;
		onBack: () => void;
	}

	let { sale, filter, onFilter, todayCount, todayTotalSat, visibleSales, onNewSale, onBack }: Props =
		$props();

	const isLn = $derived(sale.method === 'lightning');

	// 5603: same line breakdown as history (escaped text, no {@html}).
	function linesText(s: SaleRecord): string {
		return s.lines
			.map((raw) => {
				const l = resolveLine(raw);
				const head = l.modifierLabel ? `${l.name} · ${l.modifierLabel}` : l.name;
				const noted = l.note ? `${head} (${l.note})` : head;
				return `${noted} ×${l.qty}`;
			})
			.join(', ');
	}
</script>

<div class="pos-screen" data-pos-screen="success">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="success-back" onclick={onBack} aria-label="back"><ArrowLeft size={24} /></button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate testid="success-title">{$_('pos.success.title')}</Heading>
		<span class="header-spacer"></span>
	</div>

	<div class="amount-section">
		<div class="status-pills" data-testid="success-pills">
			<span class="pill pill-ok" data-testid="success-paid-pill">{$_('pos.success.title')}</span>
			{#if isLn}
				<span class="pill pill-ln" data-testid="success-method-pill">{$_('pos.success.method_lightning')}</span>
			{:else}
				<span class="pill pill-cashu" data-testid="success-method-pill">{$_('pos.success.method_cashu')}</span>
			{/if}
		</div>
		<div class="amount-display">
			<span class="amount-value" data-testid="success-amount">{sale.totalSat.toLocaleString('en-US')}</span>
			<span class="amount-unit">SAT</span>
		</div>
		<!-- TASK-5711: frozen bill fiat — the snapshot stored at pay time,
		     rendered verbatim (old bills never recompute). -->
		{#if sale.fiat.text}
			<div class="amount-secondary" data-testid="success-fiat">{sale.fiat.text}</div>
		{/if}
		<div class="amount-secondary" data-testid="success-ref">txRef {sale.refId} (sale persisted FIRST)</div>
	</div>

	<button type="button" class="btn btn-primary" data-testid="success-new-sale" onclick={onNewSale}>
		{$_('pos.success.new_sale')}
	</button>

	<div class="tab-bar" data-testid="success-tabs">
		<button
			type="button"
			class="tab-btn"
			class:tab-active={filter === 'all'}
			data-testid="filter-all"
			onclick={() => onFilter('all')}
		>
			{$_('pos.filter.all')}
		</button>
		<button
			type="button"
			class="tab-btn"
			class:tab-active={filter === 'lightning'}
			data-testid="filter-lightning"
			onclick={() => onFilter('lightning')}
		>
			{$_('pos.filter.lightning')}
		</button>
		<button
			type="button"
			class="tab-btn"
			class:tab-active={filter === 'cashu'}
			data-testid="filter-cashu"
			onclick={() => onFilter('cashu')}
		>
			{$_('pos.filter.cashu')}
		</button>
	</div>

	<div class="card" style="padding:0" data-testid="success-today">
		<div class="list-item">
			<div style="flex:1;min-width:0">
				<div class="list-item-title">{$_('pos.success.today')} ({todayCount} sale{todayCount === 1 ? '' : 's'})</div>
				<div class="list-item-subtitle" data-testid="success-today-total">
					{todayTotalSat.toLocaleString('en-US')} SAT total
				</div>
			</div>
			{#if isLn}
				<span class="pill pill-ln">LN</span>
			{:else}
				<span class="pill pill-cashu">Cashu</span>
			{/if}
		</div>
	</div>

	{#if visibleSales.length > 0}
		<div class="card" style="padding:0" data-testid="success-list">
			{#each visibleSales as s (s.id)}
				<div class="list-item" data-testid="success-row" data-sale-id={s.id}>
					<div style="flex:1;min-width:0">
						<div class="list-item-title">
							{s.totalSat.toLocaleString('en-US')} SAT
						</div>
						<!-- TASK-5711: frozen bill fiat per row (snapshot at
						     pay time, never recomputed). -->
						{#if s.fiat.text}
							<div class="list-item-subtitle" data-testid="success-row-fiat" data-row-fiat-for={s.id}>{s.fiat.text}</div>
						{/if}
						<div class="list-item-subtitle" data-testid="success-lines" data-lines-for={s.id}>{linesText(s)}</div>
						<div class="list-item-subtitle">{s.refId}</div>
					</div>
					{#if s.method === 'lightning'}
						<span class="pill pill-ln">LN</span>
					{:else}
						<span class="pill pill-cashu">Cashu</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
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
	/* TASK-5440 rev36: Heading owns the middle stretch (truncate-safe). */
	.top-bar :global(h2) {
		flex: 1;
		min-width: 0;
	}
	.amount-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}
	.status-pills {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
	}
	.amount-display {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}
	.amount-value {
		font-family: var(--font-family);
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		text-align: center;
	}
	.amount-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}
	.amount-secondary {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: center;
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
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-sm);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		border-radius: var(--radius-full);
		border: 1.5px solid transparent;
		white-space: nowrap;
	}
	.pill-ln {
		background: var(--color-protocol-lightning-light);
		color: var(--color-protocol-lightning);
	}
	.pill-cashu {
		background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
		color: var(--color-secondary);
	}
	.pill-ok {
		background: var(--color-success-light);
		color: var(--color-success);
	}
	.tab-bar {
		display: flex;
		gap: 0;
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		padding: 3px;
	}
	.tab-btn {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.tab-active {
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
		box-shadow: var(--shadow-sm);
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
</style>
