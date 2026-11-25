/**
 * TASK-5702-R13 — POS kind 10 หมวด (INTENT-057 BLUEPRINT v3 rev26, Commander ORDER
 * verbatim (2): เส้น→ยา — ตัด noodle ใส่ medicine แทน นับคง 10).
 *
 * Order (reed TASK-5712 keys): เครื่องดื่ม/กาแฟ/อาหาร/ยา/ขนม/เบเกอรี่/
 * ของหวาน/ผลไม้/ของใช้ทั่วไป/อื่นๆ — closed UI options in that order.
 *
 * Solar icons (all solar linear, verified genuine from api.iconify.design/solar —
 * verbatim paths, never hand-drawn; see medicine-proof.txt in R13 evidence):
 *  - drink = CupHot · coffee = Mug · food = Burger · snack = Donut
 *  - bakery = Cake · dessert = IceCream (ice-cream-cone) · fruit = Apple
 *  - medicine = Pill (pill-linear, verified HTTP 200 2026-11-26)
 *  - general = Bag (shopping bag = general goods) · other = Box.
 * '' and any unknown legacy string (incl. retired 'noodle'/'noodles' rows)
 * normalize to 'other' → Box (same fallback as before, old rows keep a
 * sensible tile — no data migration, locale key noodle deleted by reed).
 *
 * The catalog domain (catalog.ts) stays free-form — this file only drives
 * the kind chips UI + the icon shown per row/card/sheet box.
 *
 * Pure: no svelte imports, no storage, no rates.
 */
import type { IconName } from '$lib/components/icons/Icon.svelte';

export const POS_KIND_DRINK = 'drink';
export const POS_KIND_COFFEE = 'coffee';
export const POS_KIND_FOOD = 'food';
export const POS_KIND_MEDICINE = 'medicine';
export const POS_KIND_SNACK = 'snack';
export const POS_KIND_BAKERY = 'bakery';
export const POS_KIND_DESSERT = 'dessert';
export const POS_KIND_FRUIT = 'fruit';
export const POS_KIND_GENERAL = 'general';
export const POS_KIND_OTHER = 'other';

export const POS_KINDS = [
	POS_KIND_DRINK,
	POS_KIND_COFFEE,
	POS_KIND_FOOD,
	POS_KIND_MEDICINE,
	POS_KIND_SNACK,
	POS_KIND_BAKERY,
	POS_KIND_DESSERT,
	POS_KIND_FRUIT,
	POS_KIND_GENERAL,
	POS_KIND_OTHER
] as const;

/** Closed UI option (what the Manage kind chips write). */
export type PosKindOption = (typeof POS_KINDS)[number];

/**
 * Thai label per option (TH-pinned reference — the chips render through
 * the reed-owned locale keys pos.manage.kind.* via $_(), never this map).
 */
export const POS_KIND_LABEL_TH: Record<PosKindOption, string> = {
	drink: 'เครื่องดื่ม',
	coffee: 'กาแฟ',
	food: 'อาหาร',
	medicine: 'ยา',
	snack: 'ขนม',
	bakery: 'เบเกอรี่',
	dessert: 'ของหวาน',
	fruit: 'ผลไม้',
	general: 'ของใช้ทั่วไป',
	other: 'อื่น ๆ'
};

/** Solar icon per option — Box is the uncategorized fallback only. */
export const POS_KIND_ICON: Record<PosKindOption, IconName> = {
	drink: 'CupHot',
	coffee: 'Mug',
	food: 'Burger',
	medicine: 'Pill',
	snack: 'Donut',
	bakery: 'Cake',
	dessert: 'IceCream',
	fruit: 'Apple',
	general: 'Bag',
	other: 'Box'
};

/** True when the value is one of the closed UI options. */
export function isPosKindOption(v: unknown): v is PosKindOption {
	return (
		v === POS_KIND_DRINK ||
		v === POS_KIND_COFFEE ||
		v === POS_KIND_FOOD ||
		v === POS_KIND_MEDICINE ||
		v === POS_KIND_SNACK ||
		v === POS_KIND_BAKERY ||
		v === POS_KIND_DESSERT ||
		v === POS_KIND_FRUIT ||
		v === POS_KIND_GENERAL ||
		v === POS_KIND_OTHER
	);
}

/**
 * Normalize any stored kind (including '' and legacy free-form strings)
 * into a closed UI option. Unknown → 'other' (Box tile).
 */
export function normalizeKindOption(kind: unknown): PosKindOption {
	return isPosKindOption(kind) ? kind : POS_KIND_OTHER;
}

/**
 * Solar icon for any stored kind string — '' / unknown → 'Box'
 * (same fallback the photo picker showed with no photo).
 */
export function kindIconFor(kind: unknown): IconName {
	return POS_KIND_ICON[normalizeKindOption(kind)];
}
