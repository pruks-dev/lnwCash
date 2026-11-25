<script lang="ts">
	/**
	 * Pos — TASK-5402 (INTENT-054, SELL-UI): #/pos sell screen.
	 *
	 * Tap catalog products (sellable subset via listActive) into a bill,
	 * edit qty (+/-) before confirm. Bill math: cart.ts domain only
	 * (addToCart / decrementFromCart / removeLine / buildBill); ALL fiat
	 * legs through the existing fiat stack (convert.ts floor/dust via
	 * fiatPriceToSats + currency.ts satsToFiat/formatFiat + rates.ts entry).
	 * Custom amount via reused Numpad (SAT integer or fiat→sats convert).
	 * No SaleRecord is written here (owned by 5403/5404); confirm only
	 * freezes the cart into a bill snapshot for display.
	 * TASK-5704-FIX (INTENT-057 BLUEPRINT v3 rev12, F-5704-01 HIGH):
 * migrated to cart v3 truth-pair domain API (cartTotalLive truth-pair
 * + Result addToCart/decrement/removeLine + buildBill truth entry).
 * Catalog rows are normalized via normalizeCatalogDoc (sanctioned v1/v2
 * stored-sats MIGRATE path) so legacy persisted docs stay sellable.
 * Theme tokens only (L-P012) — no hardcoded colors.
	 * TASK-5412 (BILL-LAYOUT soft): layout-only — buttons + 5403/5404 wiring
	 * untouched, total SOFT-right (receipt anchor — see total-placement-proof.txt).
	 */
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { navigateTo } from '$lib/router';
	import { getPosCatalog } from '$lib/storage/local';
	import {
		emptyCatalog,
		listActive,
		normalizeCatalogDoc,
		type PosCatalogDoc,
		type PosProduct
	} from '$lib/pos/catalog';
	import {
		emptyCart,
		addToCart,
		decrementFromCart,
		removeLine,
		cartTotalLive,
		buildBill,
		fiatPriceToSats,
		type Cart,
		type CartLine,
		type Bill
	} from '$lib/pos/cart';
	import { getFiatCurrency, formatFiat, FIAT_CURRENCY_EVENT } from '$lib/fiat/currency';
	import { getBtcRate, type FiatCurrency, type RateEntry } from '$lib/fiat/rates';
	import { CURRENCY_META } from '$lib/fiat/convert';

	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Numpad from '$lib/components/Numpad.svelte';
	import PosCheckoutLn from './PosCheckoutLn.svelte';
	import PosCheckoutCashu from './PosCheckoutCashu.svelte';

	let doc: PosCatalogDoc = $state(emptyCatalog());
	let cart: Cart = $state(emptyCart());
	let bill = $state<Bill | null>(null);
	// TASK-5403 (CHECKOUT-LN): connection point — Charge via Lightning swaps
	// the sell view for the checkout screen. Cart/bill state stays here, so
	// Back from checkout returns to the identical bill (nothing re-created).
	// TASK-5404 (CHECKOUT-CASHU): same pattern for Cashu — checkoutMethod
	// picks the rail; both checkouts share the frozen bill + Back contract.
	let checkoutOpen: boolean = $state(false);
	let checkoutMethod: 'lightning' | 'cashu' = $state('lightning');
	let fiatCurrency: FiatCurrency = $state('THB');
	let fiatEntry = $state<RateEntry | null>(null);
	let customMode: 'sat' | 'fiat' = $state('sat');
	let customValue: string = $state('0');
	let customError: string = $state('');
	let manualSeq: number = $state(0);

	let sellable: PosProduct[] = $derived(listActive(doc));
	// TASK-5704-FIX: cartTotalSats (v1 stored-sats) is dead — v3 LIVE total
	// resolves truth per line (SAT needs no rate; fiat needs a live rate).
	// Dead rate + fiat lines → 0 here; buildBill still fails loud at pay time.
	let totalSat: number = $derived.by(() => {
		const r = cartTotalLive(cart, effectiveEntry());
		return r.ok ? r.totalSat : 0;
	});
	let fiatDecimals: number = $derived(CURRENCY_META[fiatCurrency].decimals);
	let fiatBlocked: boolean = $derived(fiatEntry !== null && fiatEntry.price === null);

	/* TASK-5410 CUSTOM-DISPLAY: live custom-amount preview (wallet Receive
	   secondaryFor pattern — primary = raw Numpad string, secondary = the
	   other unit, both aria-live). Convert legs reuse the existing fiat
	   stack only: sat→fiat via formatFiat, fiat→sats via fiatPriceToSats
	   (cart domain → convert.ts floor/dust). No local rate math, no new
	   input. Display-only: dust/invalid → "– sats", fiat 0 → "0 sats"
	   (TASK-5218 zero-display, never blocks the Numpad). */
	function formatSatDisplay(n: number): string {
		return new Intl.NumberFormat().format(n);
	}

	function customSecondaryFor(
		raw: string,
		mode: 'sat' | 'fiat',
		entry: RateEntry | null,
		currency: FiatCurrency,
		satsWord: string
	): string {
		if (mode === 'sat') {
			const n = Number(raw);
			if (!Number.isFinite(n) || n < 0) return `– ${currency}`;
			return formatFiat(Math.floor(n), entry?.price, currency);
		}
		if (raw.trim() !== '' && Number(raw) === 0) return `0 ${satsWord}`;
		if (!entry) return `– ${satsWord}`;
		const converted = fiatPriceToSats(raw, currency, entry);
		if (!converted.ok) return `– ${satsWord}`;
		return `${formatSatDisplay(converted.sats)} ${satsWord}`;
	}

	let customSecondary: string = $derived(
		customSecondaryFor(customValue, customMode, fiatEntry, fiatCurrency, $_('screen.balance.sats'))
	);

	// TASK-5704-FIX: v3 truth display — SAT truth renders sats verbatim
	// (no rate); fiat truth renders native (never converted here — the
	// live sats total below comes from cartTotalLive, never invented).
	function tilePriceText(p: PosProduct): string {
		if (p.currency === 'SAT') return `${p.amount} ${$_('screen.balance.sats')}`;
		return `${p.amount} ${p.currency}`;
	}

	function billLineText(l: CartLine): string {
		const sats = $_('screen.balance.sats');
		if (l.currency === 'SAT') return `${l.amount} ${sats} × ${l.qty} = ${l.amount * l.qty} ${sats}`;
		return `${l.amount} ${l.currency} × ${l.qty}`;
	}

	function reloadCatalog(): void {
		try {
			// Normalize: storage already returns v3, but mocked/legacy docs
			// (v1 priceSat rows) migrate here via the sanctioned domain path.
			doc = normalizeCatalogDoc(getPosCatalog());
		} catch {
			doc = emptyCatalog();
		}
	}

	async function loadFiatRate(): Promise<void> {
		try {
			fiatEntry = await getBtcRate(fiatCurrency);
		} catch {
			fiatEntry = null;
		}
	}

	function onFiatCurrencyChange(): void {
		fiatCurrency = getFiatCurrency();
		void loadFiatRate();
	}

	onMount(() => {
		reloadCatalog();
		try {
			fiatCurrency = getFiatCurrency();
		} catch {
			fiatCurrency = 'THB';
		}
		void loadFiatRate();
		if (typeof window !== 'undefined') {
			window.addEventListener(FIAT_CURRENCY_EVENT, onFiatCurrencyChange);
			// Catalog may change in #/pos-manage — refresh on return.
			window.addEventListener('hashchange', reloadCatalog);
		}
		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener(FIAT_CURRENCY_EVENT, onFiatCurrencyChange);
				window.removeEventListener('hashchange', reloadCatalog);
			}
		};
	});

	function tapProduct(product: PosProduct): void {
		const result = addToCart(cart, product, 1);
		if (!result.ok) return;
		cart = result.value;
		bill = null;
	}

	function increment(productId: string): void {
		const line = cart.lines.find((l) => l.productId === productId);
		if (!line) return;
		const product = doc.items.find((p) => p.id === productId);
		if (!product) return;
		const result = addToCart(cart, product, 1);
		if (!result.ok) return;
		cart = result.value;
		bill = null;
	}

	function decrement(productId: string): void {
		const result = decrementFromCart(cart, productId, 1);
		if (!result.ok) return;
		cart = result.value;
		bill = null;
	}

	function dropLine(productId: string): void {
		const result = removeLine(cart, productId);
		if (!result.ok) return;
		cart = result.value;
		bill = null;
	}

	function clearBill(): void {
		cart = emptyCart();
		bill = null;
		checkoutOpen = false;
		checkoutMethod = 'lightning';
		customError = '';
	}

	/** Unavailable entry — bill stays SAT-truthful, fiat renders "– CUR". */
	function effectiveEntry(): RateEntry {
		if (fiatEntry !== null) return fiatEntry;
		return { price: null, asOf: null, where: 'cache', stale: false, expired: false };
	}

	function confirmBill(): void {
		if (cart.lines.length === 0) return;
		const result = buildBill(cart, { currency: fiatCurrency, entry: effectiveEntry() });
		if (!result.ok) return;
		bill = result.value;
	}

	function addCustom(): void {
		customError = '';
		if (customMode === 'sat') {
			const n = Number(customValue);
			if (!Number.isInteger(n) || n <= 0) {
				customError = $_('pos.manage.error_price');
				return;
			}
			manualSeq += 1;
			const result = addToCart(
				cart,
				{ id: `manual_${Date.now().toString(36)}_${manualSeq}`, name: $_('pos.custom_item_name'), currency: 'SAT', amount: n, active: true },
				1
			);
			if (!result.ok) return;
			cart = result.value;
			bill = null;
			customValue = '0';
			return;
		}
		// Fiat mode — convert.ts floor/dust policy via cart domain (never local math).
		if (!fiatEntry) {
			void loadFiatRate();
			customError = $_('pos.error_fiat_unavailable');
			return;
		}
		const converted = fiatPriceToSats(customValue, fiatCurrency, fiatEntry);
		if (!converted.ok) {
			customError =
				converted.code === 'UNAVAILABLE'
					? $_('pos.error_fiat_unavailable')
					: $_('pos.error_fiat_dust');
			return;
		}
		manualSeq += 1;
		const result = addToCart(
			cart,
			{
				id: `manual_${Date.now().toString(36)}_${manualSeq}`,
				name: $_('pos.custom_item_name'),
				currency: 'SAT',
				amount: converted.sats,
				active: true
			},
			1
		);
		if (!result.ok) return;
		cart = result.value;
		bill = null;
		customValue = '0';
	}
</script>

<div class="pos-screen" role="main" aria-label={$_('pos.title')}>
	{#if checkoutOpen && bill}
		{#if checkoutMethod === 'cashu'}
			<!-- TASK-5404 (CHECKOUT-CASHU): Cashu checkout for the frozen bill. -->
			<PosCheckoutCashu {bill} onBack={() => { checkoutOpen = false; }} />
		{:else}
			<!-- TASK-5403 (CHECKOUT-LN): Lightning checkout for the frozen bill. -->
			<PosCheckoutLn {bill} onBack={() => { checkoutOpen = false; }} />
		{/if}
	{:else}
	<div class="pos-header">
		<!-- TASK-5440 rev36: title = central Heading h2 (align center + truncate). -->
		<Heading level="h2" align="center" truncate>{$_('pos.title')}</Heading>
		<div class="pos-links">
			<button type="button" class="link-btn" onclick={() => navigateTo('pos-manage')}>
				{$_('pos.manage_link')}
			</button>
			<button type="button" class="link-btn" onclick={() => navigateTo('pos-history')}>
				{$_('pos.history_link')}
			</button>
		</div>
	</div>

	<!-- ─── Catalog ─── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('pos.catalog_title')}</Heading>
			{#if sellable.length === 0}
				<Body size="sm" color="secondary">{$_('pos.catalog_empty')}</Body>
				<Body size="sm" color="secondary">{$_('pos.catalog_manage_hint')}</Body>
			{:else}
				<ul class="catalog-grid">
					{#each sellable as product (product.id)}
						<li>
							<button
								type="button"
								class="product-tile"
								onclick={() => tapProduct(product)}
								aria-label={`${product.name} — ${tilePriceText(product)}`}
							>
								<span class="product-name">{product.name}</span>
								<span class="product-price">{tilePriceText(product)}</span>
								{#if product.fiatPriced && product.currency === 'SAT' && fiatEntry?.price != null}
									<span class="product-fiat">
										≈ {formatFiat(product.amount, fiatEntry.price, fiatCurrency)}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Card>

	<!-- ─── Bill ─── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('pos.bill_title')}</Heading>
			{#if cart.lines.length === 0}
				<Body size="sm" color="secondary">{$_('pos.cart_empty')}</Body>
			{:else}
				<ul class="bill-lines">
					{#each cart.lines as line (line.productId)}
						<li class="bill-line">
							<div class="line-info">
								<Body size="sm" weight="semibold">{line.name}</Body>
								<Body size="sm" color="secondary">
									{billLineText(line)}
								</Body>
							</div>
							<div class="qty-stepper" role="group" aria-label={line.name}>
								<button
									type="button"
									class="step-btn"
									onclick={() => decrement(line.productId)}
									aria-label={$_('pos.decrease')}
								>−</button>
								<span class="qty" aria-live="polite">{line.qty}</span>
								<button
									type="button"
									class="step-btn"
									onclick={() => increment(line.productId)}
									aria-label={$_('pos.increase')}
								>+</button>
								<button
									type="button"
									class="step-btn step-remove"
									onclick={() => dropLine(line.productId)}
									aria-label={$_('pos.remove_line')}
								>×</button>
							</div>
						</li>
					{/each}
				</ul>
				<!-- TASK-5412 soft: receipt anchor — total sits RIGHT (same side as
				     History amounts), single text node kept so the 5402 sell
				     test contract (`pos.total: X sats`) stays intact. -->
				<div class="bill-total">
					<Body size="sm" weight="semibold" align="right">{$_('pos.total')}: {totalSat} {$_('screen.balance.sats')}</Body>
					<Body size="sm" color="secondary" align="right">
						{formatFiat(totalSat, fiatEntry?.price ?? null, fiatCurrency)}
						{#if fiatEntry?.stale && fiatEntry.price !== null}
							<span class="stale-badge">{$_('pos.fiat_stale')}</span>
						{/if}
						{#if fiatBlocked}
							<span class="stale-badge">{$_('pos.error_fiat_unavailable')}</span>
						{/if}
					</Body>
				</div>
				<div class="bill-actions">
					<Button variant="secondary" onclick={clearBill} ariaLabel={$_('pos.clear')}>
						{#snippet children()}{$_('pos.clear')}{/snippet}
					</Button>
					<Button variant="secondary" onclick={confirmBill} ariaLabel={$_('pos.confirm')}>
						{#snippet children()}{$_('pos.confirm')}{/snippet}
					</Button>
				</div>
			{/if}
			{#if bill}
				<div class="bill-confirmed" role="status">
					<Body size="sm" weight="semibold">
						{$_('pos.bill_confirmed_title')}: {bill.totalSat} {$_('screen.balance.sats')}
					</Body>
					<Body size="sm" color="secondary">{bill.fiat.text}</Body>
				</div>
				<!-- TASK-5403 (CHECKOUT-LN): connection point — opens the
				     Lightning checkout for the frozen bill (rev12 layout and
				     rev13 totals above are untouched).
				     TASK-5404 (CHECKOUT-CASHU): same pattern for Cashu — sets
				     the rail, then opens the shared checkout branch above. -->
				<div class="checkout-actions">
					<Button variant="primary" onclick={() => { checkoutMethod = 'lightning'; checkoutOpen = true; }} ariaLabel={$_('pos.checkout_charge')}>
						{#snippet children()}{$_('pos.checkout_charge')}{/snippet}
					</Button>
					<Button variant="secondary" onclick={() => { checkoutMethod = 'cashu'; checkoutOpen = true; }} ariaLabel={$_('pos.checkout_accept_cashu')}>
						{#snippet children()}{$_('pos.checkout_accept_cashu')}{/snippet}
					</Button>
				</div>
			{/if}
		</div>
	</Card>

	<!-- ─── Custom amount (Numpad) ─── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('pos.custom_title')}</Heading>
			<div class="option-row" role="group" aria-label={$_('pos.custom_title')}>
				<button
					type="button"
					class="option-btn"
					class:active={customMode === 'sat'}
					aria-pressed={customMode === 'sat'}
					onclick={() => { customMode = 'sat'; customValue = '0'; customError = ''; }}
				>
					{$_('pos.custom_mode_sat')}
				</button>
				<button
					type="button"
					class="option-btn"
					class:active={customMode === 'fiat'}
					aria-pressed={customMode === 'fiat'}
					onclick={() => { customMode = 'fiat'; customValue = '0'; customError = ''; }}
				>
					{$_('pos.custom_mode_fiat')} ({fiatCurrency})
				</button>
			</div>
			<!-- TASK-5410 CUSTOM-DISPLAY: live custom-amount preview (wallet
			     Receive .amount-display pattern — Numpad value renders instantly
			     via aria-live, no blur/confirm wait). No new i18n key (L-T015:
			     TH pending TASK-5409 + eye) — EN-only comment, sats word reused. -->
			<div class="custom-preview" aria-live="polite" data-testid="pos-custom-preview">
				<span class="custom-preview-value">{customValue === '0' ? '0' : customValue}</span>
				<span class="custom-preview-unit">{customMode === 'sat' ? $_('screen.balance.sats') : fiatCurrency}</span>
			</div>
			<div class="custom-secondary" aria-live="polite" data-testid="pos-custom-secondary">
				<span>{customSecondary}</span>
				{#if customMode === 'fiat' && fiatEntry && fiatEntry.price !== null && fiatEntry.stale}
					<span class="stale-badge">{$_('pos.fiat_stale')}</span>
				{/if}
			</div>
			<Numpad
				value={customValue}
				onchange={(v) => { customValue = v; customError = ''; }}
				onconfirm={addCustom}
				confirmLabel={$_('pos.custom_add')}
				maxDecimals={customMode === 'fiat' ? fiatDecimals : 0}
			/>
			{#if customError}
				<p class="form-error" role="alert">{customError}</p>
			{/if}
		</div>
	</Card>
	{/if}
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		max-width: 480px;
		margin: 0 auto;
	}

	.pos-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding-top: var(--space-sm);
	}

	.pos-links {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		padding: var(--space-xs) var(--space-sm);
		min-height: 44px;
		-webkit-tap-highlight-color: transparent;
	}

	.link-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.catalog-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-sm);
	}

	.product-tile {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-family);
		cursor: pointer;
		min-height: 64px;
		text-align: start;
		-webkit-tap-highlight-color: transparent;
	}

	.product-tile:active {
		background: var(--color-surface-variant);
	}

	.product-tile:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.product-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	.product-price {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
	}

	.product-fiat {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}

	.bill-lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.bill-line {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-top: 1px solid var(--color-border);
	}

	.bill-line:first-child {
		border-top: none;
	}

	.line-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.qty-stepper {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.step-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-md);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.step-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.step-remove {
		color: var(--color-error);
	}

	.qty {
		min-width: 24px;
		text-align: center;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
	}

	/* TASK-5412 soft: total is a right-anchored receipt block (same side as
	   History amounts — see total-placement-proof.txt). Alignment comes
	   from Body align="right" (no CSS hacks, text nodes untouched). */
	.bill-total {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: var(--space-xs);
		padding-top: var(--space-sm);
		border-top: 1px solid var(--color-border);
	}

	.stale-badge {
		display: inline-block;
		margin-inline-start: var(--space-xs);
		padding: 1px var(--space-xs);
		border-radius: var(--radius-sm);
		background: var(--color-warning-light);
		color: var(--color-warning);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
	}

	/* TASK-5412 soft: action rows wrap + share width equally (portrait
	   stacks, landscape sits side-by-side). Variants/handlers untouched —
	   Button roots are child-component DOM, so :global() carries the flex
	   (precedent: Receive .success-row :global(svg)). */
	.bill-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: var(--space-xs);
	}

	.bill-actions > :global(*) {
		flex: 1 1 140px;
	}

	.checkout-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: var(--space-xs);
	}

	.checkout-actions > :global(*) {
		flex: 1 1 160px;
	}

	.bill-confirmed {
		margin-top: var(--space-sm);
		padding: var(--space-sm);
		border-radius: var(--radius-md);
		background: var(--color-success-light);
		color: var(--color-success);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-sm);
	}

	.option-btn {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		padding: var(--space-sm);
		min-height: 44px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.option-btn.active {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.option-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.form-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}

	/* TASK-5410 CUSTOM-DISPLAY: live custom-amount preview (wallet
	   .amount-display/.amount-secondary pattern, compact for the custom
	   card). Tokens only (L-P012); 5412 wrap/layout untouched. */
	.custom-preview {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: var(--space-xs);
		padding: var(--space-xs) 0 0;
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

	.custom-secondary {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: center;
		padding-bottom: var(--space-xs);
	}

	/* TASK-5412 soft: landscape rhythm — wider sheet + 3-up catalog so
	   the eye order (catalog → bill → custom) survives rotation.
	   Tokens only; px breakpoints mirror the existing 480px pattern. */
	@media (min-width: 640px) {
		.pos-screen {
			max-width: 720px;
		}

		.catalog-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
