<script lang="ts">
	/**
	 * PosManage — TASK-5402 (INTENT-054, SELL-UI): #/pos-manage
	 *
	 * Product management: name + price (Numpad, SAT integer) + category +
	 * on-sale toggle. ALL mutations go through catalog.ts domain functions
	 * (addProduct / setProductActive / removeProduct); persistence only via
	 * getPosCatalog / setPosCatalog (local.ts). Never touches sales-log or
	 * proofsDb — no SaleRecord is written here (owned by 5403/5404).
	 * Theme tokens only (L-P012) — no hardcoded colors.
	 */
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { navigateTo } from '$lib/router';
	import { getPosCatalog, setPosCatalog } from '$lib/storage/local';
	import {
		emptyCatalog,
		addProduct,
		setProductActive,
		removeProduct,
		type PosCatalogDoc
	} from '$lib/pos/catalog';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import Numpad from '$lib/components/Numpad.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	let doc: PosCatalogDoc = $state(emptyCatalog());
	let name: string = $state('');
	let priceStr: string = $state('0');
	let kind: string = $state('');
	let active: boolean = $state(true);
	let formError: string = $state('');

	function reload(): void {
		try {
			doc = getPosCatalog();
		} catch {
			doc = emptyCatalog();
		}
	}

	onMount(() => {
		reload();
	});

	function handleBack(): void {
		navigateTo('pos');
	}

	function handleAdd(): void {
		formError = '';
		const trimmedName = name.trim();
		if (trimmedName.length === 0) {
			formError = $_('pos.manage.error_name');
			return;
		}
		// Numpad string → integer sats (SAT-only price entry, maxDecimals=0).
		const priceSat = Number(priceStr);
		if (!Number.isInteger(priceSat) || priceSat <= 0) {
			formError = $_('pos.manage.error_price');
			return;
		}
		const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
		const result = addProduct(
			doc,
			{ id, name: trimmedName, priceSat, kind: kind.trim(), active },
			Date.now()
		);
		if (!result.ok) {
			formError =
				result.code === 'EMPTY_NAME'
					? $_('pos.manage.error_name')
					: result.code === 'BAD_PRICE'
						? $_('pos.manage.error_price')
						: result.message;
			return;
		}
		doc = result.value;
		setPosCatalog(doc);
		name = '';
		priceStr = '0';
		kind = '';
		active = true;
	}

	function handleActiveToggle(id: string, e: Event): void {
		const next = (e.target as HTMLInputElement).checked;
		const result = setProductActive(doc, id, next, Date.now());
		if (!result.ok) return;
		doc = result.value;
		setPosCatalog(doc);
	}

	function handleDelete(id: string): void {
		const result = removeProduct(doc, id);
		if (!result.ok) return;
		doc = result.value;
		setPosCatalog(doc);
	}
</script>

<div class="pos-manage" role="main" aria-label={$_('pos.manage.title')}>
	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<!-- TASK-5440 rev36: title = central Heading h2 (align center + truncate). -->
		<Heading level="h2" align="center" truncate>{$_('pos.manage.title')}</Heading>
		<div class="header-spacer"></div>
	</div>

	<!-- ─── Add form ─── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('pos.manage.add')}</Heading>
			<label class="field" for="pos-name">
				<Body size="sm" weight="semibold">{$_('pos.manage.name_label')}</Body>
				<input
					id="pos-name"
					type="text"
					class="text-input"
					value={name}
					oninput={(e) => { name = (e.target as HTMLInputElement).value; formError = ''; }}
					placeholder={$_('pos.manage.name_placeholder')}
					maxlength={60}
					autocomplete="off"
				/>
			</label>
			<label class="field" for="pos-kind">
				<Body size="sm" weight="semibold">{$_('pos.manage.kind_label')}</Body>
				<input
					id="pos-kind"
					type="text"
					class="text-input"
					value={kind}
					oninput={(e) => { kind = (e.target as HTMLInputElement).value; }}
					placeholder={$_('pos.manage.kind_placeholder')}
					maxlength={30}
					autocomplete="off"
				/>
			</label>
			<div class="field">
				<Body size="sm" weight="semibold">{$_('pos.manage.price_label')}</Body>
				<!-- TASK-5410 CUSTOM-DISPLAY: live price preview (wallet Receive
				     .amount-display pattern — Numpad value renders instantly via
				     aria-live, no blur/confirm wait). SAT-only; reuse sats word.
				     No new i18n key (L-T015: TH pending TASK-5409 + eye). -->
				<div class="custom-preview" aria-live="polite" data-testid="pos-manage-price-preview">
					<span class="custom-preview-value">{priceStr === '0' ? '0' : priceStr}</span>
					<span class="custom-preview-unit">{$_('screen.balance.sats')}</span>
				</div>
				<Numpad
					value={priceStr}
					onchange={(v) => { priceStr = v; formError = ''; }}
					onconfirm={handleAdd}
					confirmLabel={$_('pos.manage.add')}
					maxDecimals={0}
				/>
			</div>
			<div class="toggle-row">
				<Toggle
					checked={active}
					onchange={(e) => { active = (e.target as HTMLInputElement).checked; }}
					ariaLabel={$_('pos.manage.active_label')}
				/>
				<div class="toggle-row-body">
					<Body size="sm" weight="semibold">{$_('pos.manage.active_label')}</Body>
				</div>
			</div>
			{#if formError}
				<p class="form-error" role="alert">{formError}</p>
			{/if}
			<Button variant="secondary" onclick={handleAdd} ariaLabel={$_('pos.manage.add')}>
				{#snippet children()}{$_('pos.manage.add')}{/snippet}
			</Button>
		</div>
	</Card>

	<!-- ─── Product list ─── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('pos.manage.list_title')}</Heading>
			{#if doc.items.length === 0}
				<Body size="sm" color="secondary">{$_('pos.manage.empty')}</Body>
			{:else}
				<ul class="product-list">
					{#each doc.items as product (product.id)}
						<li class="product-row">
							<div class="product-info">
								<Body size="sm" weight="semibold">{product.name}</Body>
								<Body size="sm" color="secondary">
									{product.priceSat} {$_('screen.balance.sats')}{#if product.kind} ({product.kind}){/if}
									({product.active ? $_('pos.manage.on_sale') : $_('pos.manage.off_sale')})
								</Body>
							</div>
							<Toggle
								checked={product.active}
								onchange={(e) => handleActiveToggle(product.id, e)}
								ariaLabel={$_('pos.manage.active_label')}
							/>
							<button
								type="button"
								class="delete-btn"
								onclick={() => handleDelete(product.id)}
								aria-label={`${$_('pos.manage.delete')}: ${product.name}`}
							>
								{$_('pos.manage.delete')}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Card>
</div>

<style>
	.pos-manage {
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

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.text-input {
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		min-height: 44px;
	}

	.text-input:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
		border-color: var(--color-primary);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
	}

	.toggle-row-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.form-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}

	/* TASK-5410 CUSTOM-DISPLAY: live price preview (wallet .amount-display
	   pattern, compact for the manage form). Tokens only (L-P012). */
	.custom-preview {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: var(--space-xs);
		padding: var(--space-xs) 0;
	}

	.custom-preview-value {
		font-family: var(--font-family);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		min-width: 1ch;
		text-align: center;
	}

	.custom-preview-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.product-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.product-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-top: 1px solid var(--color-border);
	}

	.product-row:first-child {
		border-top: none;
	}

	.product-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.delete-btn {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-error);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		padding: var(--space-xs) var(--space-sm);
		min-height: 44px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.delete-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
