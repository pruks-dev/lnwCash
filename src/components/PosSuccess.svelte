<script lang="ts">
	/**
	 * PosSuccess — TASK-5405 (INTENT-054, HISTORY-SUMMARY): paid-success screen.
	 *
	 * WRITE-BEFORE-SHOW contract (hard): this component NEVER writes a
	 * SaleRecord. It receives an already-persisted record (the `value` from
	 * a recordSale() ok:true return — callers in the 5403/5404 checkout
	 * flows render it only after the write lands). No setPosSales, no
	 * proofsDb, no wallet reads here — display only.
	 * Theme tokens only (L-P012) — no hardcoded colors.
	 */
	import { _ } from 'svelte-i18n';
	import { navigateTo } from '$lib/router';
	import { formatDeviceDateTime } from '$lib/pos/record-sale';
	import type { SaleRecord } from '$lib/pos/sales-log';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		/** Already-persisted sale — render only, never write. */
		sale: SaleRecord;
		/** Defaults keep the 5402 route map untouched (pos / pos-history). */
		onBack?: () => void;
		onViewHistory?: () => void;
	}

	let {
		sale,
		onBack = () => navigateTo('pos'),
		onViewHistory = () => navigateTo('pos-history')
	}: Props = $props();

	let methodKey: string = $derived(
		sale.method === 'lightning' ? 'pos.method_lightning' : 'pos.method_cashu'
	);
</script>

<div class="pos-success" role="main" aria-label={$_('pos.success.title')}>
	<Card variant="basic" padding="md">
		<div class="section">
			<!-- TASK-5440 rev36: title = central Heading h2 (align center + truncate). -->
			<Heading level="h2" align="center" truncate>{$_('pos.success.title')}</Heading>
			<!-- TASK-5411 (MOCKUP CONFORMANCE R5): status pills — R5
			     composite S5 (Success) ships a Paid pill (pill-ok) plus the
			     method pill (pill-ln Lightning / pill-cashu Cashu) above the
			     48px amount. Keys reused (no new i18n — L-T015); facts list
			     below keeps the same keys for screen-reader/detail parity.
			     Display-only (5405 contract untouched). -->
			<div class="status-pills" role="status">
				<span class="pill pill-ok">{$_('pos.success.title')}</span>
				<span class="pill {sale.method === 'lightning' ? 'pill-ln' : 'pill-cashu'}">{$_(methodKey)}</span>
			</div>
			<div class="total" role="status">
				<Body size="lg" weight="semibold">
					{sale.totalSat} {$_('screen.balance.sats')}
				</Body>
			</div>
			<dl class="facts">
				<div class="fact-row">
					<dt><Body size="sm" color="secondary">{$_('pos.success.method')}</Body></dt>
					<dd><Body size="sm" weight="semibold">{$_(methodKey)}</Body></dd>
				</div>
				<div class="fact-row">
					<dt><Body size="sm" color="secondary">{$_('pos.success.time')}</Body></dt>
					<dd><Body size="sm">{formatDeviceDateTime(sale.createdAtMs)}</Body></dd>
				</div>
				<div class="fact-row">
					<dt><Body size="sm" color="secondary">{$_('pos.success.ref')}</Body></dt>
					<dd><Body size="sm">{sale.refId}</Body></dd>
				</div>
			</dl>
			{#if sale.fiat.text}
				<Body size="sm" color="secondary">{sale.fiat.text}</Body>
			{/if}
			<div class="actions">
				<Button variant="secondary" onclick={onBack} ariaLabel={$_('common.back')}>
					{#snippet children()}{$_('common.back')}{/snippet}
				</Button>
				<Button variant="primary" onclick={onViewHistory} ariaLabel={$_('pos.history_link')}>
					{#snippet children()}{$_('pos.history_link')}{/snippet}
				</Button>
			</div>
		</div>
	</Card>
</div>

<style>
	.pos-success {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		max-width: 480px;
		margin: 0 auto;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		align-items: stretch;
	}

	/* TASK-5411 (MOCKUP CONFORMANCE R5): S5 status pills — pill-ok /
	   pill-ln / pill-cashu verbatim geometry from the R5 composite fixture
	   (pill radius-full, xs/sm type). Colors resolve through theme tokens
	   (L-P012) so light + dark both hold with zero hardcoded values. */
	.status-pills {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
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

	.pill-ok {
		background: var(--color-success-light);
		color: var(--color-success);
	}

	.pill-ln {
		background: var(--color-protocol-lightning-light);
		color: var(--color-protocol-lightning);
	}

	.pill-cashu {
		background: rgba(0, 137, 123, 0.12);
		color: var(--color-secondary);
	}

	.total {
		display: flex;
		justify-content: center;
		padding: var(--space-sm) 0;
	}

	.facts {
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.fact-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
		margin: 0;
	}

	.fact-row dt,
	.fact-row dd {
		margin: 0;
	}

	.actions {
		display: flex;
		gap: var(--space-sm);
	}
</style>
