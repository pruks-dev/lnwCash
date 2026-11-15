<!--
  TASK-5417 R5-only — PoS entry/router (App #/pos + BottomNav Shop tab + landscape).
  Owns: catalog load/seed (5401 domain), cart state, bill snapshot, LN quote +
  polling + completeMint, Cashu decode/receive accumulation, recordSale
  write-first → Success, sales log + Today/filter summaries.

  Money reuse = READ-ONLY imports (no wallet file edited):
  - quote/poll: same mint endpoints as Receive.svelte (requestMintQuoteWithUnit /
    getMintQuoteState pattern, fetch directly — never invents a rate)
  - LN settle: completeMint() (mint.ts) + fetchAndCacheKeysets + withTransactionGuard
  - Cashu: decodeToken/getTokenAmount (cashu/token) + receiveTokens (tokenStore)
  - record: recordSale() write-first via getPosSales/setPosSales (device-local,
    no double-write — single save per sale; no stuck funds — UNDER tokens are
    received into the wallet immediately, sale recorded only on EXACT/OVER)
  - fiat: getBtcRates/getFiatCurrency (fiat stack), null → "– CUR"

  All money deps injectable (props) so tests run hermetic without a mint.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		emptyCatalog,
		normalizeCatalogDoc,
		addProduct,
		removeProduct,
		setProductActive,
		listActive,
		type PosCatalogDoc,
		type PosProduct
	} from '$lib/pos/catalog';
	import { emptyCart, addToCart, decrementFromCart, cartTotalSats, buildBill, type Cart, type Bill } from '$lib/pos/cart';
	import {
		getPosCatalog,
		setPosCatalog,
		getPosSales,
		setPosSales
	} from '$lib/storage/local';
	import { recordSale } from '$lib/pos/record-sale';
	import {
		summarizeDay,
		deviceDayKey,
		type SaleRecord,
		type PosPayMethod
	} from '$lib/pos/sales-log';
	import { getBtcRates } from '$lib/fiat/rates';
	import { getFiatCurrency } from '$lib/fiat/currency';
	import { fiatToSats } from '$lib/fiat/convert';
	import type { FiatCurrency } from '$lib/fiat/rates';
	import { formatFiat } from '$lib/fiat/currency';
	import { fiatRowText } from '$lib/pos-ui';

	import PosCatalog from './PosCatalog.svelte';
	import PosManage from './PosManage.svelte';
	import PosBill from './PosBill.svelte';
	import PosCheckoutLn, { type LnState } from './PosCheckoutLn.svelte';
	import PosCheckoutCashu, { type CashuState } from './PosCheckoutCashu.svelte';
	import PosSuccess from './PosSuccess.svelte';
	import type { PosFilter } from '$lib/pos-ui';
	import PosHistory from './PosHistory.svelte';

	export type PosView = 'catalog' | 'manage' | 'bill' | 'ln' | 'cashu' | 'success' | 'history';

	interface Quote {
		quoteId: string;
		invoice: string;
	}

	interface MoneyDeps {
		getRate?: () => Promise<{ price: number | null; currency: FiatCurrency }>;
		createQuote?: (totalSat: number) => Promise<Quote>;
		getQuoteState?: (quoteId: string) => Promise<string>;
		completeLn?: (quoteId: string, totalSat: number) => Promise<string>;
		receiveToken?: (token: string) => Promise<number>;
		pollIntervalMs?: number;
		mintUrl?: string;
	}

	interface Props extends MoneyDeps {
		initialView?: PosView;
		onExit?: () => void;
	}

	let { initialView = 'catalog', onExit, ...deps }: Props = $props();

	// ─── state ───
	let view: PosView = $state('catalog');
	let catalog: PosCatalogDoc = $state(emptyCatalog());
	let cart: Cart = $state(emptyCart());
	let bill: Bill | null = $state(null);
	let sales: SaleRecord[] = $state([]);
	let ratePrice: number | null = $state(null);
	let rateCurrency: FiatCurrency = $state('THB');

	let lnState: LnState = $state('loading');
	let lnQuote: Quote | null = $state(null);
	let lnError: string = $state('');

	let cashuState: CashuState = $state('idle');
	let cashuReceived: number = $state(0);
	let cashuTokens: string[] = $state([]);
	let cashuPasted: string = $state('');
	let cashuScanning: boolean = $state(false);

	let lastSale: SaleRecord | null = $state(null);
	let filter: PosFilter = $state('all');

	let newName: string = $state('');
	let newPrice: string = $state('');
	let manageError: string = $state('');
	// rev48 addcard_fiat_r48 — price LIGHT: SAT/fiat unit switch; fiat input
	// converts to SAT via fiatToSats (convert.ts, read-only) at save time and
	// stores priceSat only. No currency persisted (heavy deferred to backlog).
	let priceMode: 'sat' | 'fiat' = $state('sat');

	let pollTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let pollCount: number = 0;
	let mintCompleting: boolean = false;

	const pollMs = () => deps.pollIntervalMs ?? 3000;

	// ─── default money deps (read-only reuse of wallet/cashu/fiat) ───
	async function defaultRate(): Promise<{ price: number | null; currency: FiatCurrency }> {
		try {
			const cur = getFiatCurrency();
			const snap = await getBtcRates();
			return { price: snap.rates[cur]?.price ?? null, currency: cur };
		} catch {
			return { price: null, currency: getFiatCurrency() };
		}
	}

	function mintBase(): string {
		return (deps.mintUrl ?? '').trim().replace(/\/+$/, '');
	}

	async function defaultCreateQuote(totalSat: number): Promise<Quote> {
		const base = mintBase();
		if (!base) throw new Error('no mint configured');
		const res = await fetch(`${base}/v1/mint/quote/bolt11`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ amount: Math.floor(totalSat), unit: 'sat' })
		});
		if (!res.ok) throw new Error(`quote failed: ${res.status}`);
		const data = (await res.json()) as { quote: string; request: string };
		return { quoteId: data.quote, invoice: data.request };
	}

	async function defaultQuoteState(quoteId: string): Promise<string> {
		const base = mintBase();
		const res = await fetch(`${base}/v1/mint/quote/bolt11/${encodeURIComponent(quoteId)}`);
		if (!res.ok) throw new Error(`quote state failed: ${res.status}`);
		const data = (await res.json()) as { state?: string; paid?: boolean };
		return data.state ?? (data.paid ? 'PAID' : 'UNPAID');
	}

	async function defaultCompleteLn(quoteId: string, totalSat: number): Promise<string> {
		const { fetchAndCacheKeysets } = await import('$lib/cashu/keyset');
		const { completeMint } = await import('$lib/wallet/mint');
		const { withTransactionGuard } = await import('$lib/wallet/autolock');
		const base = mintBase();
		const keysets = await fetchAndCacheKeysets(base);
		const active = keysets.filter((k) => k.active);
		if (active.length === 0) throw new Error('no active keysets');
		const result = await withTransactionGuard(() =>
			completeMint(base, quoteId, Math.floor(totalSat), active[0].id, true)
		);
		if (!result.success) throw new Error(result.error ?? 'mint failed');
		return quoteId;
	}

	async function defaultReceiveToken(token: string): Promise<number> {
		const { decodeToken, getTokenAmount } = await import('$lib/cashu/token');
		const { receiveTokens } = await import('$lib/wallet/tokenStore');
		const decoded = decodeToken(token.trim());
		const amount = getTokenAmount(decoded);
		await receiveTokens(token.trim());
		return amount;
	}

	const getRate = () => (deps.getRate ?? defaultRate)();
	const createQuote = (t: number) => (deps.createQuote ?? defaultCreateQuote)(t);
	const getQuoteState = (q: string) => (deps.getQuoteState ?? defaultQuoteState)(q);
	const completeLn = (q: string, t: number) => (deps.completeLn ?? defaultCompleteLn)(q, t);
	const receiveToken = (tok: string) => (deps.receiveToken ?? defaultReceiveToken)(tok);

	// ─── derived ───
	const products = $derived(listActive(catalog));
	const cartCount = $derived(cart.lines.reduce((n, l) => n + l.qty, 0));
	const cartTotal = $derived(cartTotalSats(cart));
	const fiatFor = (sats: number) => fiatRowText(sats, rateCurrency, { price: ratePrice } as never);
	// rev43 order_fix_r43: LEFT per-row fiat = plain formatFiat (NO ≈);
	// RIGHT per-row fiat = fiatRowText (WITH ≈). Both live-rate only.
	const fiatLeftFor = (sats: number) => formatFiat(sats, ratePrice, rateCurrency);
	const fiatRightFor = (sats: number) => fiatFor(sats);
	const cartFiat = $derived(fiatRowText(cartTotal, rateCurrency, { price: ratePrice } as never));
	const qtyFor = (id: string) => cart.lines.find((l) => l.productId === id)?.qty ?? 0;
	// rev43 order_fix_r43 — LIVE TOTAL ONLY: bill snapshot is NEVER consulted
	// for the Order total. SAT moves → fiat moves on the same live ratePrice.
	// (Fixes the 25.08 stale-snapshot hang: old bill.fiat.pricePerBtc could
	// freeze the total fiat while cart SAT kept moving.)
	const billFiat = $derived(fiatRowText(cartTotal, rateCurrency, { price: ratePrice } as never));
	const todayKey = $derived(deviceDayKey(Date.now()));
	const today = $derived(summarizeDay(sales, todayKey));
	const filteredSales = $derived(
		filter === 'all' ? sales.slice().reverse() : sales.filter((s) => s.method === filter).reverse()
	);

	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = null;
	}

	// ─── catalog/cart ───
	function seedIfEmpty(doc: PosCatalogDoc): PosCatalogDoc {
		if (doc.items.length > 0) return doc;
		const now = Date.now();
		let d = emptyCatalog(now);
		const seeds: Array<[string, string, number]> = [
			['thai-tea', 'Thai Tea', 2100],
			['coffee', 'Coffee', 1800],
			['cake', 'Cake', 3500]
		];
		for (const [id, name, priceSat] of seeds) {
			const r = addProduct(d, { id, name, priceSat, kind: 'drink', fiatPriced: true, active: true }, now);
			if (r.ok) d = r.value;
		}
		setPosCatalog(d);
		return d;
	}

	function refreshCatalog() {
		try {
			catalog = seedIfEmpty(normalizeCatalogDoc(getPosCatalog()));
		} catch {
			catalog = seedIfEmpty(emptyCatalog());
		}
	}

	function refreshSales() {
		try {
			sales = getPosSales();
		} catch {
			sales = [];
		}
	}

	async function refreshRate() {
		try {
			const r = await getRate();
			ratePrice = r.price;
			rateCurrency = r.currency;
		} catch {
			ratePrice = null;
		}
	}

	function handleInc(id: string) {
		const p = catalog.items.find((x) => x.id === id);
		if (!p) return;
		const r = addToCart(cart, p, 1);
		if (r.ok) cart = r.value;
	}

	function handleDec(id: string) {
		const r = decrementFromCart(cart, id, 1);
		if (r.ok) cart = r.value;
	}

	function snapshotBill(): Bill | null {
		const r = buildBill(cart, {
			currency: rateCurrency,
			entry: { price: ratePrice, asOf: Date.now(), where: 'cache', stale: false, expired: false }
		});
		if (!r.ok) return null;
		bill = r.value;
		return r.value;
	}

	function handleAddProduct() {
		manageError = '';
		if (!newName.trim()) {
			manageError = 'name required';
			return;
		}
		// rev48 price light: fiat mode converts live → SAT now (floor +
		// dust-block from convert.ts); SAT mode keeps the integer path.
		// Stored row is always priceSat (no currency column — heavy later).
		let price: number;
		if (priceMode === 'fiat') {
			const q = fiatToSats(newPrice.trim(), rateCurrency, ratePrice);
			if (!q.ok) {
				manageError = q.message;
				return;
			}
			price = q.sats;
		} else {
			const n = Number(newPrice);
			if (!Number.isInteger(n) || n <= 0) {
				manageError = 'price must be a positive integer';
				return;
			}
			price = n;
		}
		const id = `p_${Date.now().toString(36)}`;
		const r = addProduct(catalog, { id, name: newName.trim(), priceSat: price, kind: '', fiatPriced: true, active: true });
		if (!r.ok) {
			manageError = r.message;
			return;
		}
		catalog = r.value;
		setPosCatalog(catalog);
		newName = '';
		newPrice = '';
	}

	function handleRemoveProduct(id: string) {
		const r = removeProduct(catalog, id);
		if (r.ok) {
			catalog = r.value;
			setPosCatalog(catalog);
		}
	}

	function handleToggleActive(id: string) {
		const cur = catalog.items.find((x) => x.id === id);
		if (!cur) return;
		const r = setProductActive(catalog, id, !cur.active);
		if (r.ok) {
			catalog = r.value;
			setPosCatalog(catalog);
		}
	}

	// ─── LN flow ───
	async function openLn() {
		const b = snapshotBill();
		if (!b) return;
		stopPolling();
		mintCompleting = false;
		pollCount = 0;
		lnState = 'loading';
		lnError = '';
		lnQuote = null;
		view = 'ln';
		try {
			const q = await createQuote(b.totalSat);
			lnQuote = q;
			lnState = 'polling';
			schedulePoll();
		} catch (e) {
			lnState = 'error';
			lnError = e instanceof Error ? e.message : 'quote failed';
		}
	}

	function schedulePoll() {
		stopPolling();
		pollTimer = setTimeout(tick, pollMs());
	}

	async function tick() {
		if (mintCompleting || !lnQuote || !bill) return;
		pollCount += 1;
		if (pollCount >= 60) {
			stopPolling();
			lnError = 'payment timeout';
			lnState = 'error';
			return;
		}
		try {
			const st = await getQuoteState(lnQuote.quoteId);
			if (mintCompleting) return;
			if (st === 'PAID' || st === 'ISSUED') {
				mintCompleting = true;
				stopPolling();
				const refId = await completeLn(lnQuote.quoteId, bill.totalSat);
				persistSale('lightning', refId, bill);
			} else if (st === 'EXPIRED') {
				// R5 risk-c: single CTA back to bill, NO auto-requote, old quote abandoned
				stopPolling();
				lnQuote = null;
				lnState = 'expired';
			} else {
				schedulePoll();
			}
		} catch {
			if (!mintCompleting) schedulePoll();
		}
	}

	function cancelLn() {
		// rev43 order_fix_r43: Cancel = abandon quote AND clear the bill
		// snapshot, back to a LIVE Order (stale snapshot never reused for
		// totals — live ratePrice only). Rate refreshed so SAT→fiat is fresh.
		stopPolling();
		mintCompleting = false;
		lnQuote = null;
		bill = null;
		view = 'bill';
		void refreshRate();
	}

	// rev43 order_fix_r43: EVERY back-to-Order path clears the bill snapshot
	// and refreshes the live rate — the Order total is always cartTotal ×
	// live ratePrice, never a frozen bill.fiat.
	function backToBill() {
		bill = null;
		view = 'bill';
		void refreshRate();
	}

	function copyLn() {
		// rev32: parent fallback — PosCheckoutLn owns the UX copy
		// (Copy icon + common.copy + copied/error toast, Receive-verbatim);
		// this stays as the silent fallback so the invoice is still copied
		// even if the component handler is bypassed.
		try {
			if (lnQuote?.invoice) void navigator.clipboard?.writeText(lnQuote.invoice);
		} catch {
			// clipboard unavailable — invoice text stays visible for manual copy
		}
	}

	// ─── Cashu flow (rev34: auto-scan only + buttons-only paste) ───
	// rev34 camera_square_theme_r34: entering Cashu opens the live QRScanner
	// immediately (scanning=true from openCashu — the idle Scan ghost is GONE,
	// no onScan prop anymore); Paste (clipboard + auto-submit) + Confirm stay
	// as the backup path beside/under the live view — NO textarea, NO typing.
	// Closed scanner (X) falls back to the static preview + paste buttons.
	function openCashu() {
		const b = snapshotBill();
		if (!b) return;
		cashuState = 'idle';
		cashuReceived = 0;
		cashuTokens = [];
		cashuPasted = '';
		cashuScanning = true;
		view = 'cashu';
	}

	async function receiveCashuToken(tok: string) {
		if (!tok || !bill) return;
		cashuState = 'receiving';
		try {
			// funds first (no stuck funds), sale recorded only on EXACT/OVER
			const amount = await receiveToken(tok);
			cashuTokens = [...cashuTokens, tok];
			cashuReceived += amount;
			cashuPasted = '';
			if (cashuReceived < bill.totalSat) cashuState = 'under';
			else if (cashuReceived === bill.totalSat) cashuState = 'exact';
			else cashuState = 'over';
		} catch {
			cashuState = 'invalid';
		}
	}

	async function submitCashuToken() {
		const tok = cashuPasted.trim();
		if (!tok) return;
		await receiveCashuToken(tok);
	}

	function handleCashuDecode(decoded: string) {
		// Real scanner path: animated-UR decoded payload OR static token —
		// QRScanner (with its per-instance ur-decoder) already reassembled it.
		// Same receive path as paste; scanner closes on first decode.
		cashuScanning = false;
		cashuPasted = decoded;
		void receiveCashuToken(decoded.trim());
	}

	function closeCashuScanner() {
		cashuScanning = false;
	}

	function scanAnother() {
		// rev32: reopen the live scanner for the next token (till flow stays
		// scan-first; paste backup stays mounted beside it).
		cashuState = 'idle';
		cashuPasted = '';
		cashuScanning = true;
	}

	function confirmCashu() {
		if (!bill || (cashuState !== 'exact' && cashuState !== 'over')) return;
		// v1 record-only: no change token; refId = last token id (link-by-id)
		persistSale('cashu', `cashu:${cashuTokens.length}:${cashuReceived}`, bill, cashuReceived);
	}

	// ─── write-first record ───
	function persistSale(method: PosPayMethod, refId: string, b: Bill, receivedSat?: number) {
		const total = b.totalSat;
		const res = recordSale(
			{
				totalSat: total,
				fiat: { currency: b.fiat.currency, pricePerBtc: b.fiat.pricePerBtc, amount: b.fiat.amount, text: b.fiat.text },
				method,
				refId,
				lines: b.lines
			},
			{
				existing: sales,
				save: (next) => {
					try {
						const ok = setPosSales(next);
						if (ok) sales = next;
						return ok;
					} catch {
						return false;
					}
				}
			}
		);
		if (!res.ok) {
			// PERSIST_FAIL = no screen (nothing stored, nothing to show)
			lnState = 'error';
			lnError = res.message;
			cashuState = 'invalid';
			view = method === 'lightning' ? 'ln' : 'cashu';
			return;
		}
		lastSale = res.value;
		// received over-pay noted on the stored record's ref line only (v1 record-only)
		void receivedSat;
		filter = 'all';
		cart = emptyCart();
		bill = null;
		lnQuote = null;
		cashuTokens = [];
		cashuReceived = 0;
		cashuPasted = '';
		cashuScanning = false;
		view = 'success';
	}

	function newSale() {
		cart = emptyCart();
		bill = null;
		lastSale = null;
		lnQuote = null;
		lnState = 'loading';
		cashuState = 'idle';
		cashuReceived = 0;
		cashuTokens = [];
		cashuPasted = '';
		cashuScanning = false;
		filter = 'all';
		refreshSales();
		view = 'catalog';
	}

	onMount(() => {
		if (initialView !== 'catalog') view = initialView;
		refreshCatalog();
		refreshSales();
		void refreshRate();
	});

	onDestroy(() => stopPolling());
</script>

<div class="pos-app" data-pos-app data-pos-view={view}>
	{#if view === 'catalog'}
		<PosCatalog
			{products}
			{fiatFor}
			cartCount={cartCount}
			cartTotalSat={cartTotal}
			{cartFiat}
			{qtyFor}
			onInc={handleInc}
			onDec={handleDec}
			onOpenBill={() => {
				if (cartCount > 0) view = 'bill';
			}}
			onOpenManage={() => (view = 'manage')}
			onOpenHistory={() => {
				refreshSales();
				view = 'history';
			}}
		/>
	{:else if view === 'manage'}
		<PosManage
			items={catalog.items}
			{fiatFor}
			newName={newName}
			newPrice={newPrice}
			manageError={manageError}
			onNewName={(v) => (newName = v)}
			onNewPrice={(v) => (newPrice = v)}
			onAddProduct={handleAddProduct}
			onRemoveProduct={handleRemoveProduct}
			onToggleActive={handleToggleActive}
			onBack={() => (view = 'catalog')}
			priceMode={priceMode}
			onPriceMode={(m) => {
				priceMode = m;
				newPrice = '';
				manageError = '';
			}}
			rateCurrency={rateCurrency}
			ratePrice={ratePrice}
		/>
	{:else if view === 'bill'}
		<PosBill
			lines={cart.lines}
			totalSat={cartTotal}
			fiatText={billFiat}
			fiatLeftFor={fiatLeftFor}
			fiatRightFor={fiatRightFor}
			onInc={handleInc}
			onDec={handleDec}
			onChargeLn={() => void openLn()}
			onChargeCashu={openCashu}
			onBack={() => (view = 'catalog')}
		/>
	{:else if view === 'ln'}
		<PosCheckoutLn
			totalSat={bill?.totalSat ?? cartTotal}
			invoice={lnQuote?.invoice ?? ''}
			state={lnState}
			error={lnError}
			onCopy={copyLn}
			onCancel={cancelLn}
			onBackToBill={backToBill}
			onBack={backToBill}
		/>
	{:else if view === 'cashu'}
		<PosCheckoutCashu
			totalSat={bill?.totalSat ?? cartTotal}
			receivedSat={cashuReceived}
			state={cashuState}
			pasted={cashuPasted}
			scanning={cashuScanning}
			onPasted={(v) => (cashuPasted = v)}
			onDecodeToken={handleCashuDecode}
			onCloseScanner={closeCashuScanner}
			onSubmitToken={() => void submitCashuToken()}
			onScanAnother={scanAnother}
			onConfirm={confirmCashu}
			onBack={backToBill}
		/>
	{:else if view === 'success' && lastSale}
		<PosSuccess
			sale={lastSale}
			{filter}
			onFilter={(f) => (filter = f)}
			todayCount={today.count}
			todayTotalSat={today.totalSat}
			visibleSales={filteredSales.filter((s) => s.id === lastSale?.id || true).slice(0, 5)}
			onNewSale={newSale}
			onBack={() => (view = 'catalog')}
		/>
	{:else if view === 'history'}
		<PosHistory
			sales={filteredSales}
			{filter}
			onFilter={(f) => (filter = f)}
			todayLabel={$_('pos.success.today')}
			todayCount={today.count}
			todayTotalSat={today.totalSat}
			todayLn={today.byMethod.lightning.totalSat}
			todayCashu={today.byMethod.cashu.totalSat}
			onBack={() => (view = 'catalog')}
		/>
	{/if}
</div>

<style>
	.pos-app {
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}
</style>
