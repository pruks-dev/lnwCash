<script lang="ts">
	/**
	 * PosHistory — TASK-5402 (INTENT-054, SELL-UI) shell + TASK-5405 fill
	 * (INTENT-054, HISTORY-SUMMARY): #/pos-history
	 *
	 * READ-ONLY sales history (device day groups + per-sale lines + today /
	 * current-shift summaries). Reads via getPosSales() only — NEVER writes
	 * SaleRecord here (sale creation is owned by the checkout flows via
	 * record-sale.ts). No proofsDb / tokenStore / getTransactions access:
	 * the wallet is linked BY ID ONLY — each row shows its quote/token
	 * refId and a read-only jump to the wallet history screen. Shop totals
	 * and wallet totals are never added together. No proofDb access.
	 * All bucketing is DEVICE-LOCAL (deviceDayKey / summarizeDay /
	 * summarizeShift / startOfLocalDay) — never UTC slicing.
	 * Theme tokens only (L-P012) — no hardcoded colors.
	 */
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { navigateTo } from '$lib/router';
	import { getPosSales } from '$lib/storage/local';
	import {
		listSaleDays,
		summarizeDay,
		summarizeShift,
		deviceDayKey,
		type SaleRecord
	} from '$lib/pos/sales-log';
	import { formatDeviceDateTime, startOfLocalDay } from '$lib/pos/record-sale';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	let sales: SaleRecord[] = $state([]);

	function reload(): void {
		try {
			sales = getPosSales();
		} catch {
			sales = [];
		}
	}

	onMount(() => {
		reload();
		if (typeof window !== 'undefined') {
			window.addEventListener('hashchange', reload);
		}
		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('hashchange', reload);
			}
		};
	});

	let days: string[] = $derived(listSaleDays(sales));

	/** Today (device-local day) summary — shop totals only, never wallet. */
	let todaySummary = $derived(summarizeDay(sales, deviceDayKey(Date.now())));

	/**
	 * Current shift (device-local): [local midnight, now).
	 * Shift cut is local-midnight — never UTC.
	 */
	let shiftSummary = $derived(summarizeShift(sales, startOfLocalDay(Date.now()), Date.now()));

	function salesOfDay(day: string): SaleRecord[] {
		return sales
			.filter((s) => deviceDayKey(s.createdAtMs) === day)
			.sort((a, b) => b.createdAtMs - a.createdAtMs);
	}

	/** Link-by-id only: jump to the wallet history screen (read-only). */
	function handleWalletLink(): void {
		navigateTo('history');
	}

	function handleBack(): void {
		navigateTo('pos');
	}
</script>

<div class="pos-history" role="main" aria-label={$_('pos.history.title')}>
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<!-- TASK-5440 rev36: title = central Heading h2 (align center + truncate). -->
		<Heading level="h2" align="center" truncate>{$_('pos.history.title')}</Heading>
		<div class="header-spacer"></div>
	</div>

	{#if sales.length === 0}
		<Card variant="basic" padding="md">
			<div class="section">
				<Body size="sm" color="secondary">{$_('pos.history.empty')}</Body>
			</div>
		</Card>
	{:else}
		<!-- ─── Today summary (device-local day, shop totals only) ─── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<div class="day-header">
					<Heading level="h4">{$_('pos.history.today_title')}</Heading>
					<Body size="sm" color="secondary">
						{$_('pos.history.count', { values: { count: todaySummary.count } })}
						({todaySummary.totalSat} {$_('screen.balance.sats')})
					</Body>
				</div>
				<div class="method-split">
					<Body size="sm" color="secondary">
						{$_('screen.history.protocol_lightning')}: {todaySummary.byMethod.lightning.count} ({todaySummary.byMethod.lightning.totalSat} {$_('screen.balance.sats')})
					</Body>
					<Body size="sm" color="secondary">
						{$_('screen.history.protocol_cashu')}: {todaySummary.byMethod.cashu.count} ({todaySummary.byMethod.cashu.totalSat} {$_('screen.balance.sats')})
					</Body>
				</div>
			</div>
		</Card>

		<!-- ─── Current shift summary (device-local midnight cut, shop only) ─── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<div class="day-header">
					<Heading level="h4">{$_('pos.history.shift_title')}</Heading>
					<Body size="sm" color="secondary">
						{$_('pos.history.count', { values: { count: shiftSummary.count } })}
						({shiftSummary.totalSat} {$_('screen.balance.sats')})
					</Body>
				</div>
				<div class="method-split">
					<Body size="sm" color="secondary">
						{$_('screen.history.protocol_lightning')}: {shiftSummary.byMethod.lightning.count} ({shiftSummary.byMethod.lightning.totalSat} {$_('screen.balance.sats')})
					</Body>
					<Body size="sm" color="secondary">
						{$_('screen.history.protocol_cashu')}: {shiftSummary.byMethod.cashu.count} ({shiftSummary.byMethod.cashu.totalSat} {$_('screen.balance.sats')})
					</Body>
				</div>
			</div>
		</Card>

		{#each days.slice().reverse() as day (day)}
			{@const summary = summarizeDay(sales, day)}
			<Card variant="basic" padding="md">
				<div class="section">
					<div class="day-header">
						<Heading level="h4">{day}</Heading>
						<Body size="sm" color="secondary">
							{$_('pos.history.count', { values: { count: summary.count } })}
							({summary.totalSat} {$_('screen.balance.sats')})
						</Body>
					</div>
					<div class="method-split">
						<Body size="sm" color="secondary">
							{$_('screen.history.protocol_lightning')}: {summary.byMethod.lightning.count} ({summary.byMethod.lightning.totalSat} {$_('screen.balance.sats')})
						</Body>
						<Body size="sm" color="secondary">
							{$_('screen.history.protocol_cashu')}: {summary.byMethod.cashu.count} ({summary.byMethod.cashu.totalSat} {$_('screen.balance.sats')})
						</Body>
					</div>
					<ul class="sale-list">
						{#each salesOfDay(day) as sale (sale.id)}
							<li class="sale-row">
								<div class="sale-info">
									<Body size="sm" weight="semibold">
										{sale.totalSat} {$_('screen.balance.sats')}
									</Body>
									<!-- TASK-5462 rev47 history_badge_r47: per-sale method = wallet
									     History tx-protocol-badge เต็ม (Lightning/Cashu สี/ไซส์ xs,
									     pinned screen.history.protocol_* — no short LN pill,
									     no invented keys). -->
									<div class="sale-meta-row">
										<Body size="sm" color="secondary">
											{formatDeviceDateTime(sale.createdAtMs)}
										</Body>
										{#if sale.method === 'lightning'}
											<span
												class="tx-protocol-badge protocol-lightning"
												title={$_('screen.history.protocol_lightning')}
											>
												{$_('screen.history.protocol_lightning')}
											</span>
										{:else}
											<span
												class="tx-protocol-badge protocol-cashu"
												title={$_('screen.history.protocol_cashu')}
											>
												{$_('screen.history.protocol_cashu')}
											</span>
										{/if}
									</div>
									<Body size="sm" color="secondary">
										{sale.lines.map((l) => `${l.name} ×${l.qty}`).join(', ')}
									</Body>
									{#if sale.fiat.text}
										<Body size="sm" color="secondary">{sale.fiat.text}</Body>
									{/if}
									<Body size="sm" color="secondary">
										{$_('pos.history.ref')}: {sale.refId}
									</Body>
								</div>
								<button
									type="button"
									class="wallet-link"
									onclick={handleWalletLink}
									aria-label={$_('pos.history.wallet_link')}
								>
									{$_('pos.history.wallet_link')}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			</Card>
		{/each}
	{/if}
</div>

<style>
	.pos-history {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		max-width: 480px;
		margin: 0 auto;
	}

	.top-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 48px;
	}

	/* TASK-5440 rev36: Heading owns the middle stretch (truncate-safe). */
	.top-bar :global(h2) {
		flex: 1;
		min-width: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm);
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		-webkit-tap-highlight-color: transparent;
	}

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* TASK-5440 rev36: header-spacer wallet standard (was top-spacer). */
	.header-spacer {
		width: 44px;
		flex-shrink: 0;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.day-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.method-split {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sale-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.sale-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-top: 1px solid var(--color-border);
	}

	.sale-row:first-child {
		border-top: none;
	}

	.sale-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* TASK-5462 rev47 history_badge_r47: datetime + full protocol badge row. */
	.sale-meta-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	/* TASK-5462 rev47 history_badge_r47: PoS history badge = wallet History
	   tx-protocol-badge เต็ม (Lightning/Cashu สี/ไซส์ xs) — ค่า CSS verbatim
	   จาก src/screens/History.svelte (read-only reuse, ห้าม fork สี/ไซส์เอง). */
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

	.wallet-link {
		background: none;
		border: none;
		color: var(--color-primary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		padding: var(--space-xs) var(--space-sm);
		min-height: 44px;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.wallet-link:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
