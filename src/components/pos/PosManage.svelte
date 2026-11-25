<!--
  TASK-5702-R13 consistency + เส้น→ยา (INTENT-057 BLUEPRINT v3 rev26,
  Commander ORDER verbatim "เอาแค่นี้ก่อน — ไม่เอาสี — consistency ทั้งฟอร์ม + เส้น→ยา"):
  (1) consistency ทั้งฟอร์มเพิ่ม+แก้ — add/detail ใช้ shared classes ชุดเดียว
  (.pos-field/.unit-switch/.chips/.preset-add/.kind-chips/.sheet-heading/.btn)
  + metrics ยึด mockup R6: input radius 8px/padding 0 10px/font 16px ·
  preset-add input 8px / btn radius 12px/font 14px · × วงกลม 26px ·
  ปุ่มสกุล min-height 48px · ระยะ list-item gap 12px · การ์ด gap 10px ·
  ปุ่ม .btn 48px/font 15px ตรง mockup list-B + .add-save · ป้ายราคา SAT
  ใช้ price_in {SAT} ทั้ง 2 ฟอร์ม (เลิก product_price ข้างเดียว).
  ห้ามเพิ่มสี — แตะแค่ขนาด/radius/font/gap (tokens สีเดิมทั้งหมด).
  (2) เส้น→ยา: kind slot เดิมหลัง food นับคง 10 — medicine + solar Pill
  ของจริง (pill-linear, HTTP 200) + keys reed 5712 (TH ยา / EN Pharmacy).
  TASK-5702-R12 roundup 8 (INTENT-057 BLUEPRINT v3 rev25, Commander ORDER
  verbatim สั่งเลย — คุยทีละเรื่องครบ):
  (1) add sheet saves then closes at once (was: stays open) · (2) headings
  back (R8, kept): ตัวเลือก/ประเภท both sheets + ตั้งราคาด้วยสกุล add sheet
  · (3) currency follows setting (R8, kept): SAT|{rateCurrency}, no dead THB
  · (4) locale sweep: every sheet literal via $_() with reed 5709 keys
  (kind 10 TH+EN) · (5) errors ทางการ via 5709 keys (no {ccy} placeholder
  anymore) · (6) exit anim: sheets slide down on close — owned by the
  shared Modal (leaving state) · (7) detail sheet switches currency
  (SAT|{setting} + retype price — domain updateProduct accepts the
  currency patch, no BLOCKER) · (8) kind 10 closed options + genuine
  solar icons 10/10 genuine (medicine = Pill, verified HTTP 200 — see
  kind-icons.ts).
  (1) แถวเพิ่มตรง mockup R6 — input radius 8px/padding 10px + ปุ่ม
  radius 12px/font 14px ทั้ง 2 ฟอร์ม (.preset-add shared) · (2) × วงกลมจริง
  — flex กลาง 2 แกน + ล็อก 26px + shrink 0 ทั้ง 2 ฟอร์ม (.chip-x shared)
  · (3) popup ต่อสาย presets รายตัว — ดู PosModifierPopup (presets prop) +
  PosApp wiring (presets={popupFor.presets}).
  TASK-5702-R8 follow-up (INTENT-057 BLUEPRINT v3 rev20, Commander ORDER
  verbatim (1)(2)(3) + reed TASK-5707 keys):
  (1) short headings back — ตัวเลือก/ประเภท both sheets + ตั้งราคาด้วยสกุล
  add sheet (no parens) · (2) fiat follows rateCurrency (addFiat dropped —
  no dead THB) — unit buttons SAT|{setting} · (3) all R7 hardcode via
  $_() (pos.manage.* incl. kind EN).
  TASK-5702-R7 simplify 9 (INTENT-057 BLUEPRINT v3 rev19, Commander ORDER
  verbatim — สั่งแก้เท่านี้ก่อน):
  (1) add ตัดกล่องไอคอนทิ้ง (เหลือ kind chips) · (2) ลบคำอธิบายไอคอน
  ทั้ง 2 ฟอร์ม (detail เหลือไอคอนเพียว) · (3) add ตัด dropdown สกุลรอง —
  เหลือ SAT|{setting} เพียว (fiat = setting ตายตัว) · (4) ตัดสวิตช์แสดงราคา fiat
  ทั้งเพิ่ม+แก้ (โชว์คู่เสมอ — fiatPriced=true อัตโนมัติ) · (5) ตัดสวิตช์
  ขายทันทีฟอร์มเพิ่ม (active=true อัตโนมัติ) · (6) sheet แก้แบบเดียวกัน
  (ไอคอน+kind+สกุล+ราคา+preset+หยุดขาย+ลบ+บันทึก) · (7) kind 10 หมวด
  (R12 — was 4): drink/coffee/food/medicine/snack/bakery/dessert/fruit/
  general/other + solar ผูกครบ 10 genuine (''+unknown→other; retired
  'noodle' rows →other tile, locale key deleted by reed 5712) · (8) ลบคำอธิบาย
  หลังราคา+ตัวเลือกทั้ง 2 ฟอร์ม · (9) kind dropdown → chips 10 หมวด
  แตะเลือกทั้งเพิ่ม+แก้.

  Supersedes R6 strip photos (kind icon preview boxes + kind select +
  secondary-fiat select + fiatPriced selects + active toggle + truth
  description paragraphs — all GONE).

  List-B unchanged: tap-to-detail rows (kind tile + name + pair + truth
  badge + state + chevron). Detail sheet: pure kind icon + pair
  + currency switch + name + price + preset ×/add + kind chips + หยุดขาย/ลบ/บันทึก.
  Add sheet: name + SAT|{setting} switch + price + pair + preset ×/add + kind
  chips + Save (no icon box, no secondary select, no toggles).

  Money rule: this file NEVER converts itself — pair text comes from the
  priceFor prop (catalogPriceText truth API), previews build a temp truth
  pair and reuse priceFor. resolveTruthPair import is validation ONLY.
  No wallet/cashu imports, no localStorage, theme tokens only.
  Wide frame unchanged: 480 → 720 (≥640px) → 960 (≥1024px), pos-only.
-->
<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import ProductKindIcon from './ProductKindIcon.svelte';
	import { POS_KINDS, POS_KIND_ICON, normalizeKindOption } from '$lib/pos/kind-icons';
	import { resolveTruthPair, type PosProduct, type PosCurrency } from '$lib/pos/catalog';
	import type { FiatCurrency } from '$lib/fiat/rates';

	export type ManagePriceMode = 'sat' | 'fiat';

	/** Add-sheet extra fields (truth itself comes from priceMode/rateCurrency/newPrice). */
	export interface ManageAddDetail {
		kind: string;
		fiatPriced: boolean;
		active: boolean;
		presets: string[];
	}

	/** Detail-sheet patch (R12: currency is switchable SAT|{setting} + retyped price). */
	export interface ManageUpdatePatch {
		name?: string;
		currency?: PosCurrency;
		amount?: number;
		kind?: string;
		fiatPriced?: boolean;
		presets?: string[];
	}

	interface Props {
		items: PosProduct[];
		/** Pair-price text per product — catalogPriceText truth API bound in PosApp. */
		priceFor: (p: Pick<PosProduct, 'currency' | 'amount'>) => string;
		newName: string;
		newPrice: string;
		manageError: string;
		onNewName: (v: string) => void;
		onNewPrice: (v: string) => void;
		/** Returns null on success, error text on failure (caller clears fields). */
		onAddProduct: (detail: ManageAddDetail) => string | null;
		onUpdateProduct: (id: string, patch: ManageUpdatePatch) => string | null;
		onRemoveProduct: (id: string) => void;
		onToggleActive: (id: string) => void;
		onBack: () => void;
		/** Truth side for the add form (SAT vs fiat). */
		priceMode?: ManagePriceMode;
		onPriceMode?: (m: ManagePriceMode) => void;
		/** Fiat side of the add form — the wallet setting (SAT|{setting}, never dead THB). */
		rateCurrency?: FiatCurrency;
		ratePrice?: number | null;
	}

	let {
		items,
		priceFor,
		newName,
		newPrice,
		manageError,
		onNewName,
		onNewPrice,
		onAddProduct,
		onUpdateProduct,
		onRemoveProduct,
		onToggleActive,
		onBack,
		priceMode = 'sat',
		onPriceMode = () => {},
		rateCurrency = 'THB',
		ratePrice = null
	}: Props = $props();

	// ─── add sheet state ───
	// R8 follow-up: NO addFiat (dropped — fiat is rateCurrency, the wallet
	// setting) · NO icon box · NO switches — pair always shows, every add
	// sells immediately.
	let addOpen = $state(false);
	let addPresets: string[] = $state([]);
	let addPresetNew = $state('');
	let addKind = $state('other');

	// ─── detail sheet state ───
	// R12 currency switch: dCurrency starts at the row's own truth;
	// tapping SAT|{setting} flips it and clears the price for re-entry
	// (กรอกราคาใหม่). The domain accepts the pair patch (no BLOCKER).
	let detailId: string | null = $state(null);
	let dName = $state('');
	let dCurrency: PosCurrency = $state('SAT');
	let dPrice = $state('');
	let dKind = $state('other');
	let dPresets: string[] = $state([]);
	let dPresetNew = $state('');
	let dError = $state('');

	const detail = $derived(detailId ? (items.find((p) => p.id === detailId) ?? null) : null);

	// Row removed underneath an open sheet → close (no orphan editor).
	$effect(() => {
		if (detailId && !items.some((p) => p.id === detailId)) {
			detailId = null;
			dError = '';
		}
	});

	function openDetail(p: PosProduct): void {
		detailId = p.id;
		dName = p.name;
		dCurrency = p.currency;
		dPrice = String(p.amount);
		dKind = normalizeKindOption(p.kind);
		dPresets = [...p.presets];
		dPresetNew = '';
		dError = '';
	}

	function setDetailCurrency(currency: PosCurrency): void {
		if (dCurrency === currency) return;
		dCurrency = currency;
		dPrice = '';
		dError = '';
	}

	function closeDetail(): void {
		detailId = null;
		dError = '';
	}

	function truthBadgeClass(currency: PosCurrency): string {
		return currency === 'SAT' ? 'truth-sat' : `truth-${String(currency).toLowerCase()}`;
	}

	/** Parse a raw price string against a truth currency (validation = resolveTruthPair only). */
	function parseTruthAmount(currency: PosCurrency, raw: string): number | null {
		const t = raw.trim();
		if (!t) return null;
		const n = Number(t);
		if (!Number.isFinite(n)) return null;
		return resolveTruthPair(currency, n).ok ? n : null;
	}

	// Add preview — temp truth pair through the SAME priceFor (never converts here).
	const addPreviewText = $derived.by((): string => {
		const currency: PosCurrency = priceMode === 'sat' ? 'SAT' : rateCurrency;
		const amount = parseTruthAmount(currency, newPrice);
		if (amount === null) return '';
		return priceFor({ currency, amount });
	});

	// Detail preview — selected truth side (SAT|{setting}), live-typed amount.
	const detailPreviewText = $derived.by((): string => {
		const amount = parseTruthAmount(dCurrency, dPrice);
		if (amount === null) return '';
		return priceFor({ currency: dCurrency, amount });
	});

	function addPreset(list: string[], v: string): string[] {
		const t = v.trim();
		if (!t || list.includes(t)) return list;
		return [...list, t].slice(0, 20);
	}

	function dropPreset(list: string[], v: string): string[] {
		return list.filter((e) => e !== v);
	}

	function handleAddSave(): void {
		// R7 simplify (4)(5): pair always shows + every add sells
		// immediately — the sheet carries no switches anymore.
		// R12 (1): success closes the sheet at once (like the detail
		// sheet) and resets locals for the next open.
		const err = onAddProduct({
			kind: addKind.trim(),
			fiatPriced: true,
			active: true,
			presets: [...addPresets]
		});
		if (err === null) {
			addPresets = [];
			addPresetNew = '';
			addKind = 'other';
			addOpen = false;
		}
		// error text arrives via the parent-owned manageError prop —
		// the sheet stays open so the seller can fix and retry.
	}

	function handleDetailSave(): void {
		if (!detail) return;
		const name = dName.trim();
		if (!name) {
			dError = get(_)('pos.manage.error_name');
			return;
		}
		const amount = parseTruthAmount(dCurrency, dPrice);
		if (amount === null) {
			dError = get(_)('pos.manage.error_price');
			return;
		}
		const err = onUpdateProduct(detail.id, {
			name,
			currency: dCurrency,
			amount,
			kind: dKind.trim(),
			fiatPriced: true,
			presets: [...dPresets]
		});
		if (err === null) closeDetail();
		else dError = err;
	}
</script>

<div class="pos-screen" data-pos-screen="manage">
	<div class="top-bar">
		<button type="button" class="back-btn" data-testid="manage-back" onclick={onBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<!-- TASK-5440 rev36 header_std_r36: central Heading (was raw h2) -->
		<Heading level="h2" align="center" truncate>{$_('pos.catalog.manage')}</Heading>
		<!-- rev49: header + button opens the add bottom-sheet (solar
		     AddCircle, 24px in a 44px touch target, aria = pinned
		     pos.catalog.add_product — no new locale keys, L-T015). -->
		<button
			type="button"
			class="icon-btn"
			data-testid="manage-open-add"
			aria-label={$_('pos.catalog.add_product')}
			onclick={() => (addOpen = true)}
		>
			<Icon name="AddCircle" size={24} />
		</button>
	</div>

	{#if items.length === 0}
		<p class="note" data-testid="manage-empty">{$_('pos.catalog.empty')}</p>
	{:else}
		<div class="pos-scroll" data-testid="manage-list-scroll">
		<div class="card" style="padding:0" data-testid="manage-list">
			{#each items as p (p.id)}
				<!-- LIST-B: whole row taps into the detail sheet. No per-row
				     buttons, no overflow-menu — toggle/remove moved into the
				     sheet (testids kept there). -->
				<div
					class="list-item"
					class:off-sale={!p.active}
					data-testid="manage-row"
					data-product-id={p.id}
					data-active={p.active}
					role="button"
					tabindex="0"
					aria-label={p.name}
					onclick={() => openDetail(p)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openDetail(p);
						}
					}}
				>
					<span class="thumb" aria-hidden="true">
						<ProductKindIcon kind={p.kind} size={24} />
					</span>
					<div style="flex:1;min-width:0">
						<div class="list-item-title">{p.name}</div>
						<div class="list-item-subtitle" data-testid="manage-fiat" data-fiat-for={p.id}>
							{priceFor(p)}
						</div>
					</div>
					<div class="badges">
						<span
							class="truth-badge {truthBadgeClass(p.currency)}"
							data-testid="manage-truth"
							data-truth-for={p.id}
						>
							{p.currency}
						</span>
						<span
							class="status-badge"
							class:badge-off={!p.active}
							data-testid="manage-state"
							data-state-for={p.id}
						>
							{p.active ? $_('pos.catalog.on_sale') : $_('pos.catalog.off_sale')}
						</span>
					</div>
					<span class="chev" aria-hidden="true">
						<Icon name="ArrowRight" size={20} />
					</span>
				</div>
			{/each}
		</div>
		</div>
	{/if}
	<!-- ADD sheet (bottomsheet #1): R7 — name + SAT|{setting} switch + price
	     + pair + preset×/add + kind chips + Save (no icon box, no
	     secondary select, no switches, no descriptions).
	     Sheet title = pinned pos.catalog.add_product (single source).
	     R12 (1): save closes the sheet at once. -->
	<Modal
		open={addOpen}
		onclose={() => (addOpen = false)}
		variant="bottomsheet"
		title={$_('pos.catalog.add_product')}
	>
		<div class="card add-card" data-testid="manage-add">
			<!-- R7 simplify (1): NO icon box — kind is picked by chips below. -->
			<label class="pos-field">
				<span>{$_('pos.catalog.product_name')}</span>
				<input
					type="text"
					value={newName}
					data-testid="manage-name"
					oninput={(e) => onNewName((e.target as HTMLInputElement).value)}
				/>
			</label>
			<!-- R8 (1): short heading back — no parens. R8 (2): fiat = rateCurrency (the setting). -->
			<p class="sheet-heading" data-testid="manage-truth-heading">{$_('pos.manage.truth_heading')}</p>
			<div class="unit-switch" role="group" aria-label={$_('pos.manage.truth_heading')} data-testid="manage-unit-switch">
				<button
					type="button"
					class="unit-btn"
					class:unit-on={priceMode === 'sat'}
					data-testid="manage-mode-sat"
					aria-pressed={priceMode === 'sat'}
					onclick={() => onPriceMode('sat')}
				>
					SAT
				</button>
				<button
					type="button"
					class="unit-btn"
					class:unit-on={priceMode === 'fiat'}
					data-testid="manage-mode-fiat"
					aria-pressed={priceMode === 'fiat'}
					onclick={() => onPriceMode('fiat')}
				>
					{rateCurrency}
				</button>
			</div>
			<!-- R8 (2): no secondary select ever — the label follows rateCurrency too. -->
			{#if priceMode === 'fiat'}
				<label class="pos-field">
					<span>{$_('pos.manage.price_in', { values: { ccy: rateCurrency } })}</span>
					<input
						type="text"
						inputmode="decimal"
						value={newPrice}
						data-testid="manage-price"
						oninput={(e) => onNewPrice((e.target as HTMLInputElement).value)}
					/>
				</label>
			{:else}
				<label class="pos-field">
					<!-- R13 consistency: SAT label uses price_in {SAT} like the
					     fiat branch + the detail sheet (was product_price). -->
					<span>{$_('pos.manage.price_in', { values: { ccy: 'SAT' } })}</span>
					<input
						type="number"
						min="1"
						step="1"
						value={newPrice}
						data-testid="manage-price"
						oninput={(e) => onNewPrice((e.target as HTMLInputElement).value)}
					/>
				</label>
			{/if}
			{#if addPreviewText}
				<p class="preview" data-testid="manage-preview">
					{addPreviewText}
				</p>
			{/if}
			<!-- R8 (1): short heading back. R8 (3): every R7 hardcode via $_(). -->
			<div>
				<p class="sheet-heading" data-testid="manage-preset-heading">{$_('pos.manage.preset_heading')}</p>
				<div class="chips" data-testid="manage-presets">
					{#each addPresets as preset (preset)}
						<span class="chip-wrap">
							<span class="chip chip-on">{preset}</span><button
								class="chip-x"
								type="button"
								data-preset-remove={preset}
								aria-label={$_('pos.manage.preset_remove', { values: { name: preset } })}
								onclick={() => (addPresets = dropPreset(addPresets, preset))}
								>×</button
							>
						</span>
					{/each}
				</div>
				<div class="preset-add">
					<input
						type="text"
						placeholder={$_('pos.manage.preset_new_placeholder')}
						aria-label={$_('pos.manage.preset_new_label')}
						data-testid="manage-preset-new"
						value={addPresetNew}
						oninput={(e) => (addPresetNew = (e.target as HTMLInputElement).value)}
					/>
					<button
						class="preset-add-btn"
						type="button"
						data-testid="manage-preset-add"
						onclick={() => {
							addPresets = addPreset(addPresets, addPresetNew);
							addPresetNew = '';
						}}>{$_('pos.manage.preset_add')}</button
					>
				</div>
			</div>
			<!-- R7 simplify (9) → R8 (3) → R12 (8): 10 chips tap-to-pick, localized labels. -->
			<p class="sheet-heading" data-testid="manage-kind-heading">{$_('pos.manage.kind_heading')}</p>
			<div class="kind-chips" data-testid="manage-kind" role="group" aria-label={$_('pos.manage.kind_heading')}>
				{#each POS_KINDS as k (k)}
					<button
						type="button"
						class="chip kind-chip"
						class:chip-on={addKind === k}
						data-kind-option={k}
						aria-pressed={addKind === k}
						onclick={() => (addKind = k)}
					>
						<Icon name={POS_KIND_ICON[k]} size={20} />{$_('pos.manage.kind.' + k)}
					</button>
				{/each}
			</div>
			{#if manageError}
				<p class="pos-error" data-testid="manage-error">{manageError}</p>
			{/if}
			<button
				type="button"
				class="btn btn-primary add-save"
				data-testid="manage-save"
				onclick={() => handleAddSave()}
			>
				{$_('pos.catalog.save')}
			</button>
		</div>
	</Modal>

	<!-- DETAIL sheet (bottomsheet #2): R7 — pure kind icon + pair +
	     R12 (7) currency switch + name + price + preset×/add + kind chips
	     + หยุดขาย/ลบ/บันทึก. Old row testids
	     manage-toggle / manage-remove live in this sheet with the same
	     data-attrs. -->
	<Modal
		open={detailId !== null}
		onclose={() => closeDetail()}
		variant="bottomsheet"
		title={detail?.name ?? ''}
	>
		{#if detail}
			<div class="card add-card" data-testid="manage-detail" data-detail-for={detail.id}>
				<!-- R7 simplify (2)(6): pure kind icon — no description text. -->
				<div class="d-photo" data-testid="manage-detail-photo">
					<div class="d-thumb" data-testid="manage-detail-thumb">
						<ProductKindIcon kind={dKind} size={28} />
					</div>
				</div>
				<p class="sheet-price-pair">
					{detailPreviewText || priceFor(detail)}
				</p>
				<label class="pos-field">
					<span>{$_('pos.catalog.product_name')}</span>
					<input
						type="text"
						value={dName}
						data-testid="manage-detail-name"
						oninput={(e) => (dName = (e.target as HTMLInputElement).value)}
					/>
				</label>
				<!-- R14 (INTENT-057 BLUEPRINT v3 rev27, Commander ORDER verbatim
				     "ย้ายติดราคา + เติมหัวข้อตั้งราคาด้วยสกุล"): name ขึ้นก่อน —
				     ลำดับ ไอคอน → คู่ราคา → ชื่อ → สวิตช์สกุล → ราคา →
				     ตัวเลือก → ประเภท → ปุ่ม (เหมือนฟอร์มเพิ่ม) + หัวข้อ
				     truth_heading คำเดียว ไม่มีวงเล็บ (key เดิม ไม่ invent).
				     R12 (7) kept: SAT|{setting} flips dCurrency + clears
				     price for re-entry. -->
				<p class="sheet-heading" data-testid="manage-detail-truth-heading">{$_('pos.manage.truth_heading')}</p>
				<div class="unit-switch" role="group" aria-label={$_('pos.manage.truth_heading')} data-testid="manage-detail-unit-switch">
					<button
						type="button"
						class="unit-btn"
						class:unit-on={dCurrency === 'SAT'}
						data-testid="manage-detail-mode-sat"
						aria-pressed={dCurrency === 'SAT'}
						onclick={() => setDetailCurrency('SAT')}
					>
						SAT
					</button>
					<button
						type="button"
						class="unit-btn"
						class:unit-on={dCurrency === rateCurrency}
						data-testid="manage-detail-mode-fiat"
						aria-pressed={dCurrency === rateCurrency}
						onclick={() => setDetailCurrency(rateCurrency)}
					>
						{rateCurrency}
					</button>
				</div>
				<label class="pos-field">
					<span>{$_('pos.manage.price_in', { values: { ccy: dCurrency } })}</span>
					<input
						type={dCurrency === 'SAT' ? 'number' : 'text'}
						inputmode={dCurrency === 'SAT' ? 'numeric' : 'decimal'}
						min={dCurrency === 'SAT' ? '1' : undefined}
						step={dCurrency === 'SAT' ? '1' : undefined}
						value={dPrice}
						data-testid="manage-detail-price"
						oninput={(e) => (dPrice = (e.target as HTMLInputElement).value)}
					/>
				</label>
				<!-- R8 (1)+(3): preset heading back + every hardcode via $_(). -->
				<div>
					<p class="sheet-heading" data-testid="manage-detail-preset-heading">{$_('pos.manage.preset_heading')}</p>
					<div class="chips" data-testid="manage-detail-presets">
						{#each dPresets as preset (preset)}
							<span class="chip-wrap">
								<span class="chip chip-on">{preset}</span><button
									class="chip-x"
									type="button"
									data-preset-remove={preset}
									aria-label={$_('pos.manage.preset_remove', { values: { name: preset } })}
									onclick={() => (dPresets = dropPreset(dPresets, preset))}
									>×</button
								>
							</span>
						{/each}
					</div>
					<div class="preset-add">
						<input
							type="text"
							placeholder={$_('pos.manage.preset_new_placeholder')}
							aria-label={$_('pos.manage.preset_new_label')}
							data-testid="manage-detail-preset-new"
							value={dPresetNew}
							oninput={(e) => (dPresetNew = (e.target as HTMLInputElement).value)}
						/>
						<button
							class="preset-add-btn"
							type="button"
							data-testid="manage-detail-preset-add"
							onclick={() => {
								dPresets = addPreset(dPresets, dPresetNew);
								dPresetNew = '';
							}}>{$_('pos.manage.preset_add')}</button
						>
					</div>
				</div>
				<!-- R7 simplify (9) → R8 (3) → R12 (8): kind dropdown → 10 chips, localized. -->
				<p class="sheet-heading" data-testid="manage-detail-kind-heading">{$_('pos.manage.kind_heading')}</p>
				<div class="kind-chips" data-testid="manage-detail-kind" role="group" aria-label={$_('pos.manage.kind_heading')}>
					{#each POS_KINDS as k (k)}
						<button
							type="button"
							class="chip kind-chip"
							class:chip-on={dKind === k}
							data-kind-option={k}
							aria-pressed={dKind === k}
							onclick={() => (dKind = k)}
						>
							<Icon name={POS_KIND_ICON[k]} size={20} />{$_('pos.manage.kind.' + k)}
						</button>
					{/each}
				</div>
				{#if dError}
					<p class="pos-error" data-testid="manage-detail-error">{dError}</p>
				{/if}
				<div class="d-row">
					<button
						type="button"
						class="btn btn-secondary"
						data-testid="manage-toggle"
						data-toggle-for={detail.id}
						aria-pressed={detail.active}
						onclick={() => onToggleActive(detail.id)}
					>
						{detail.active ? $_('pos.catalog.off_sale') : $_('pos.catalog.on_sale')}
					</button>
					<button
						type="button"
						class="btn btn-danger"
						data-testid="manage-remove"
						data-remove-for={detail.id}
						onclick={() => {
							onRemoveProduct(detail.id);
						}}
					>
						{$_('pos.catalog.remove')}
					</button>
				</div>
				<button
					type="button"
					class="btn btn-primary add-save"
					data-testid="manage-detail-save"
					onclick={() => handleDetailSave()}
				>
					{$_('pos.catalog.save')}
				</button>
			</div>
		{/if}
	</Modal>
</div>

<style>
	.pos-screen {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		/* rev30 scroll-height: same dvh-calc bound as catalog/bill —
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
	/* rev49: header + button — same 44px touch target as the catalog
	   header icon buttons (Box/History pattern), theme tokens only. */
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
	/* rev30 scroll-height: flex:1 + min-height:0 + overflow-y:auto;
	   overscroll contain, touch-action pan-y — NEVER none (list stays
	   finger-scrollable up/down, outer page may still chain). No fixed px.
	   rev49: list keeps the middle scroll; forms live in sheets. */
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
	/* LIST-B rows: tap-to-detail (whole row = button).
	   R13 consistency: gap 12px verbatim mockup R6 list-B. */
	.list-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: var(--space-sm) var(--space-md);
		min-height: 64px;
		cursor: pointer;
	}
	.list-item.off-sale {
		opacity: 0.65;
	}
	.thumb {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-surface-variant);
	}
	/* R6 strip: kind-icon tile fills the 48px thumb box (no photo). */
	.thumb :global(.kind-tile) {
		width: 48px !important;
		height: 48px !important;
		aspect-ratio: auto !important;
		border-radius: var(--radius-md);
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
	/* R8 (1): short section headings in both sheets — small secondary
	   text, theme tokens only (no parens in copy). */
	.sheet-heading {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.badges {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-end;
		flex-shrink: 0;
	}
	/* R3 rev7 truth-badge ฟ้าคู่ — every truth currency uses the SAME
	   primary-blue pair (no per-currency colors). */
	.truth-badge {
		display: inline-flex;
		padding: 2px 10px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
		background: rgba(34, 211, 238, 0.14);
		color: var(--color-primary);
		border: 1px solid rgba(34, 211, 238, 0.4);
		flex-shrink: 0;
	}
	.truth-thb {
		background: rgba(34, 211, 238, 0.14);
		color: var(--color-primary);
		border-color: rgba(34, 211, 238, 0.4);
	}
	.truth-sat {
		background: rgba(34, 211, 238, 0.14);
		color: var(--color-primary);
		border-color: rgba(34, 211, 238, 0.4);
	}
	.status-badge {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}
	.badge-off {
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
	}
	/* Row chevron — solar ArrowRight reuse (aria-hidden, hint only). */
	.chev {
		color: var(--color-text-secondary);
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
	/* R13 consistency: every action button 48px/font 15px verbatim
	   mockup R6 list-B .btn — d-row toggle/remove now match .add-save
	   (was base 44px/13px). */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		border: 1.5px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		min-height: 48px;
		font-size: var(--font-size-md);
		padding: var(--space-sm) var(--space-md);
		width: 100%;
		flex-shrink: 0;
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
	.btn-danger {
		background: transparent;
		color: var(--color-error);
		border-color: var(--color-error);
	}
	.note {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-align: center;
	}
	/* R13 consistency: label 14px + input radius 8px/padding 0 10px/font
	   16px verbatim mockup R6 (was tokens 13px/6px/8px/15px) — both
	   sheets share this class, no per-form drift. */
	.pos-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		margin-top: var(--space-sm);
	}
	.pos-field input {
		min-height: 44px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 0 10px;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 16px;
	}
	.pos-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		text-align: center;
	}
	/* rev48 addcard_fiat_r48 — centered Card (switch + preview centered).
	   rev49: Card lives inside the bottom sheet (max-width 480); keeps its
	   own max-width 400 + margin auto centering. 5702: same chrome, truth
	   fields added. Explicit close only; save stays open for the next item. */
	/* R13 consistency: card gap 10px verbatim mockup R6 add-card/d-body
	   (was space-sm 8px) — both sheets share .add-card. */
	.add-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: stretch;
		max-width: 400px;
		margin: 0 auto;
		width: 100%;
	}
	/* R7 simplify: add-sheet icon box REMOVED (1) — kind is picked by
	   chips below, no preview tile, no description text. */
	.d-photo {
		display: flex;
		align-items: center;
	}
	.d-thumb {
		width: 64px;
		height: 64px;
		border-radius: 10px;
		flex-shrink: 0;
		border: 1.5px dashed var(--color-border);
		background: var(--color-surface-variant);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		color: var(--color-text-secondary);
	}
	/* R6 strip (TASK-5702-R6): kind-icon tile fills the 64px detail box. */
	.d-thumb :global(.kind-tile) {
		width: 100% !important;
		height: 100% !important;
		aspect-ratio: auto !important;
		border-radius: 10px;
	}
	.unit-switch {
		display: flex;
		justify-content: center;
		gap: var(--space-sm);
	}
	/* R13 consistency: ปุ่มสกุล min-height 48px (task pins 48) — both
	   switches share this class. */
	.unit-btn {
		min-height: 48px;
		min-width: 88px;
		padding: 0 var(--space-md);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-sm);
	}
	.unit-btn.unit-on {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-primary-contrast);
	}
	.preview {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		text-align: center;
	}
	.sheet-price-pair {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		text-align: left;
	}
	/* R2 preset-delete (rev6 แบบที่ 1): chip edit mode — × per chip + add box. */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: var(--space-sm);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 14px;
		border-radius: var(--radius-full);
		border: 1.5px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.chip-on {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}
	.chip-wrap {
		position: relative;
		display: inline-block;
	}
	.chip-wrap .chip {
		padding-right: 16px;
	}
	.chip-x {
		position: absolute;
		top: -9px;
		right: -9px;
		/* R9 option (2): × วงกลมจริง — flex กลาง 2 แกน + ล็อก 26px
		   + shrink 0 (ตรง mockup R6 L-P036 — ทั้ง 2 ฟอร์มใช้คลาสนี้ร่วมกัน). */
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 26px;
		height: 26px;
		min-width: 26px;
		min-height: 26px;
		border-radius: var(--radius-full);
		border: 1.5px solid var(--color-error);
		background: var(--color-surface);
		color: var(--color-error);
		font-size: 13px;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
		padding: 0;
	}
	/* R13 consistency: preset-add margin-top 10px verbatim mockup R6
	   (gap 8px already matches) — both sheets share. */
	.preset-add {
		display: flex;
		gap: var(--space-sm);
		margin-top: 10px;
	}
	.preset-add input {
		flex: 1;
		min-height: 44px;
		border: 1px solid var(--color-border);
		/* R9 option (1): ตรง mockup R6 L-P036 — input radius 8px/padding 10px
		   (tokens --radius-sm=6px ไม่ตรง mockup — ใช้ค่าตรง ทั้ง 2 ฟอร์ม). */
		border-radius: 8px;
		padding: 0 10px;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-md);
		min-width: 0;
	}
	.preset-add input::placeholder {
		color: var(--color-text-secondary);
	}
	.preset-add-btn {
		min-height: 44px;
		padding: 0 var(--space-md);
		/* R9 option (1): ตรง mockup R6 L-P036 — ปุ่ม radius 12px/font 14px
		   (tokens --radius-md=10px ไม่ตรง mockup — ใช้ค่าตรง ทั้ง 2 ฟอร์ม). */
		border-radius: 12px;
		flex-shrink: 0;
		border: 1.5px solid var(--color-primary);
		background: transparent;
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
		font-size: 14px;
		cursor: pointer;
		white-space: nowrap;
	}
	/* R7 simplify (9) → R12 (8): kind chips — 10 หมวดแตะเลือก (same .chip base). */
	.kind-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: var(--space-sm);
	}
	.kind-chip {
		gap: 6px;
	}
	.kind-chip :global(svg) {
		flex-shrink: 0;
	}
	/* Detail sheet action row: toggle + remove share the width. */
	.d-row {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
	.d-row .btn {
		flex: 1;
	}
	.add-save {
		margin-top: var(--space-sm);
		min-height: 48px;
		font-size: var(--font-size-md);
	}
</style>
