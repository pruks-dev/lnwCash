<!--
  TASK-5417 R5-only — S6 history/summary (composite §B S5 lower half + 5405 rules).
  R5 truth:
  - Today card (Today, N sales, total + per-method split, device-local day)
  - filter tabs All/Lightning/Cashu (mirrors History.svelte)
  - sale rows: amount + device-local time + tx-protocol-badge FULL (rev47:
    wallet-History verbatim Lightning/Cashu xs — short LN pill REMOVED)
    + ref + wallet link (link-by-id ONLY)
  - shop/wallet separation: NO proofsDb/tokenStore/getTransactions imports here —
    this component renders SaleRecord[] only (reference ids as text)
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import type { SaleRecord } from '$lib/pos/sales-log';
	import { resolveLine } from '$lib/pos/cart';
	import { formatDeviceDateTime } from '$lib/pos/record-sale';
	import type { PosFilter } from '$lib/pos-ui';

	interface Props {
		sales: SaleRecord[];
		filter: PosFilter;
		onFilter: (f: PosFilter) => void;
		todayLabel: string;
		todayCount: number;
		todayTotalSat: number;
		todayLn: number;
		todayCashu: number;
		onBack: () => void;
		onWalletLink?: (refId: string) => void;
	}

	let {
		sales,
		filter,
		onFilter,
		todayLabel,
		todayCount,
		todayTotalSat,
		todayLn,
		todayCashu,
		onBack,
		onWalletLink
	}: Props = $props();

	// 5603: per-line breakdown for every sale row (2-shape: legacy lines
	// resolve to empty-identity, so old history still renders).
	// e.g. "ลาเต้ร้อน · หวานน้อย (หวานน้อย) ×1, เอสเพรสโซ ×2"
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

<div class="pos-screen" data-pos-screen="history">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="history-back" onclick={onBack} aria-label="back"><ArrowLeft size={24} /></button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.history.title')}</Heading>
		<span class="header-spacer"></span>
	</div>

	<div class="tab-bar" data-testid="history-tabs">
		<button type="button" class="tab-btn" class:tab-active={filter === 'all'} data-testid="history-filter-all" onclick={() => onFilter('all')}>
			{$_('pos.filter.all')}
		</button>
		<button type="button" class="tab-btn" class:tab-active={filter === 'lightning'} data-testid="history-filter-lightning" onclick={() => onFilter('lightning')}>
			{$_('pos.filter.lightning')}
		</button>
		<button type="button" class="tab-btn" class:tab-active={filter === 'cashu'} data-testid="history-filter-cashu" onclick={() => onFilter('cashu')}>
			{$_('pos.filter.cashu')}
		</button>
	</div>

	<div class="card" data-testid="history-today">
		<div class="list-item" style="padding:0">
			<div style="flex:1;min-width:0">
				<div class="list-item-title">{todayLabel} ({todayCount} sale{todayCount === 1 ? '' : 's'})</div>
				<div class="list-item-subtitle" data-testid="history-today-total">
					{todayTotalSat.toLocaleString('en-US')} SAT total (LN {todayLn.toLocaleString('en-US')}, Cashu {todayCashu.toLocaleString('en-US')})
				</div>
			</div>
		</div>
	</div>

	{#if sales.length === 0}
		<p class="note" data-testid="history-empty">{$_('pos.history.empty')}</p>
	{:else}
		<div class="card" style="padding:0" data-testid="history-list">
			{#each sales as s (s.id)}
				<div class="list-item" data-testid="history-row" data-sale-id={s.id}>
					<div style="flex:1;min-width:0">
						<div class="list-item-title">
							{s.totalSat.toLocaleString('en-US')} SAT ({formatDeviceDateTime(s.createdAtMs)})
						</div>
						<!-- TASK-5711: frozen bill fiat per row (snapshot at
						     pay time, never recomputed — old bills freeze). -->
						{#if s.fiat.text}
							<div class="list-item-subtitle" data-testid="history-fiat" data-fiat-for={s.id}>{s.fiat.text}</div>
						{/if}
						<div class="list-item-subtitle" data-testid="history-lines" data-lines-for={s.id}>{linesText(s)}</div>
						<div class="list-item-subtitle">{s.refId}</div>
					</div>
					{#if s.method === 'lightning'}
						<span
							class="tx-protocol-badge protocol-lightning"
							data-testid="history-protocol-badge"
							title={$_('screen.history.protocol_lightning')}
						>
							{$_('screen.history.protocol_lightning')}
						</span>
					{:else}
						<span
							class="tx-protocol-badge protocol-cashu"
							data-testid="history-protocol-badge"
							title={$_('screen.history.protocol_cashu')}
						>
							{$_('screen.history.protocol_cashu')}
						</span>
					{/if}
					{#if onWalletLink}
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							style="width:auto"
							data-testid="history-wallet-link"
							data-link-for={s.id}
							onclick={() => onWalletLink(s.refId)}
						>
							{$_('pos.history.wallet_link')}
						</button>
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
	/* TASK-5462 rev47 history_badge_r47: PoS history badge = wallet History
	   tx-protocol-badge เต็ม (Lightning/Cashu สี/ไซส์ xs) — ค่า CSS verbatim
	   จาก src/screens/History.svelte (read-only reuse, ห้าม fork สี/ไซส์เอง).
	   short LN pill (.pill/.pill-ln) REMOVED — badge เต็มเท่านั้น. */
	.tx-protocol-badge.protocol-lightning {
		background: rgba(0, 188, 212, 0.25);
		color: var(--color-primary);
	}
	.tx-protocol-badge.protocol-cashu {
		background: rgba(124, 58, 237, 0.22);
		color: var(--color-protocol-lightning);
	}
	:global([data-theme='dark']) .tx-protocol-badge.protocol-lightning {
		background: rgba(38, 198, 218, 0.18);
		color: var(--color-primary-light);
	}
	:global([data-theme='dark']) .tx-protocol-badge.protocol-cashu {
		background: rgba(183, 148, 244, 0.18);
		color: var(--color-protocol-lightning);
	}
	.tx-protocol-badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--color-white);
		padding: 1px 6px;
		letter-spacing: 0.02em;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1.5px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		min-height: 44px;
		font-size: var(--font-size-sm);
		padding: var(--space-sm) var(--space-md);
	}
	.btn-ghost {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
	}
	.btn-sm {
		font-size: var(--font-size-xs);
		border-radius: var(--radius-sm);
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
</style>
