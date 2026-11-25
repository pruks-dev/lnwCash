/**
 * TASK-5702 — catalog presets passthrough (INTENT-057 BLUEPRINT v3 Manage B).
 * Additive-only pins for the `presets` field (cleanPresets): add defaults
 * to [], trims/dedupes/caps, normalize passes stored lists through and
 * drops garbage, update replaces the whole list. Truth-pair behavior
 * untouched (5710 owns pricing — this file only pins the new field).
 */
import { describe, it, expect } from 'vitest';
import {
	addProduct,
	updateProduct,
	normalizeCatalogDoc,
	emptyCatalog,
	cleanPresets,
	getProduct
} from './catalog';

describe('5702 presets (additive, truth-pair untouched)', () => {
	it('add defaults presets to [] when omitted', () => {
		const r = addProduct(emptyCatalog(1), { id: 'p1', name: 'Latte', currency: 'THB', amount: 65 }, 1);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'p1')).toMatchObject({ currency: 'THB', amount: 65, presets: [] });
	});

	it('add cleans presets: trim + drop empties + dedupe', () => {
		const r = addProduct(
			emptyCatalog(1),
			{ id: 'p1', name: 'Latte', currency: 'SAT', amount: 2000, presets: [' หวานปกติ ', '', 'หวานปกติ', '  '] },
			1
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'p1')?.presets).toEqual(['หวานปกติ']);
	});

	it('normalize passes stored presets through, garbage becomes []', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 3,
				updatedAt: 1,
				items: [
					{ id: 'a', name: 'A', currency: 'THB', amount: 65, presets: ['น้อย', 'มาก'] },
					{ id: 'b', name: 'B', currency: 'SAT', amount: 100, presets: 'nope' },
					{ id: 'c', name: 'C', currency: 'SAT', amount: 100 }
				]
			},
			1
		);
		expect(doc.items.find((p) => p.id === 'a')?.presets).toEqual(['น้อย', 'มาก']);
		expect(doc.items.find((p) => p.id === 'b')?.presets).toEqual([]);
		expect(doc.items.find((p) => p.id === 'c')?.presets).toEqual([]);
	});

	it('update replaces the whole preset list (cleaned)', () => {
		const added = addProduct(
			emptyCatalog(1),
			{ id: 'p1', name: 'Latte', currency: 'THB', amount: 65, presets: ['a'] },
			1
		);
		expect(added.ok).toBe(true);
		if (!added.ok) return;
		const r = updateProduct(added.value, 'p1', { presets: [' x ', 'x', 'y'] }, 2);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'p1')?.presets).toEqual(['x', 'y']);
	});

	it('cleanPresets caps count and length', () => {
		const many = Array.from({ length: 30 }, (_, i) => `opt-${i}`);
		expect(cleanPresets(many)).toHaveLength(20);
		const long = 'z'.repeat(100);
		expect(cleanPresets([long])).toEqual([long.slice(0, 40)]);
		expect(cleanPresets(null)).toEqual([]);
	});
});
