/**
 * TASK-5402 (INTENT-054, SELL-UI) — manage screen (#/pos-manage).
 *
 * Covers (mutations ONLY via catalog.ts, persisted via setPosCatalog):
 *   - empty catalog shows the empty state.
 *   - name + Numpad price + add → setPosCatalog with the new product.
 *   - empty name → pos.manage.error_name, nothing persisted.
 *   - bad price (0) → pos.manage.error_price, nothing persisted.
 *   - row toggle flips on-sale; delete drops the product.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosManage from '../../screens/PosManage.svelte';
import { getPosCatalog, setPosCatalog } from '$lib/storage/local';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) { fn('en'); return () => {}; },
			set() {}
		},
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn()
}));

vi.mock('$lib/storage/local', () => ({
	getPosCatalog: vi.fn(() => ({ schema: 1, updatedAt: 1, items: [] })),
	setPosCatalog: vi.fn(() => true)
}));

describe('TASK-5402 manage screen (#/pos-manage)', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('shows the empty state when the catalog is empty', () => {
		render(PosManage, {});
		expect(screen.getByText('pos.manage.empty')).toBeTruthy();
	});

	it('adds name + Numpad price via catalog.ts and persists', async () => {
		render(PosManage, {});
		await fireEvent.input(screen.getByPlaceholderText('pos.manage.name_placeholder'), {
			target: { value: 'Thai tea' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		await fireEvent.click(screen.getByRole('button', { name: '0' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'pos.manage.add' }).at(-1)!);

		expect(setPosCatalog).toHaveBeenCalledTimes(1);
		const saved = vi.mocked(setPosCatalog).mock.calls[0][0];
		expect(saved.items).toHaveLength(1);
		expect(saved.items[0].name).toBe('Thai tea');
		expect(saved.items[0].priceSat).toBe(50);
		expect(saved.items[0].active).toBe(true);
		// Row appears in the list.
		expect(screen.getByText('Thai tea')).toBeTruthy();
	});

	it('rejects an empty name without persisting', async () => {
		render(PosManage, {});
		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'pos.manage.add' }).at(-1)!);
		expect(screen.getByText('pos.manage.error_name')).toBeTruthy();
		expect(setPosCatalog).not.toHaveBeenCalled();
	});

	it('rejects a zero price without persisting', async () => {
		render(PosManage, {});
		await fireEvent.input(screen.getByPlaceholderText('pos.manage.name_placeholder'), {
			target: { value: 'Free air' }
		});
		await fireEvent.click(screen.getAllByRole('button', { name: 'pos.manage.add' }).at(-1)!);
		expect(screen.getByText('pos.manage.error_price')).toBeTruthy();
		expect(setPosCatalog).not.toHaveBeenCalled();
	});

	it('row toggle flips on-sale and delete drops the product', async () => {
		render(PosManage, {});
		await fireEvent.input(screen.getByPlaceholderText('pos.manage.name_placeholder'), {
			target: { value: 'Thai tea' }
		});
		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'pos.manage.add' }).at(-1)!);
		expect(vi.mocked(setPosCatalog)).toHaveBeenCalledTimes(1);

		// Second switch on the page = the product row toggle (first = form).
		const switches = screen.getAllByRole('switch', { name: 'pos.manage.active_label' });
		expect(switches).toHaveLength(2);
		await fireEvent.click(switches[1]);
		expect(vi.mocked(setPosCatalog)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(setPosCatalog).mock.calls[1][0].items[0].active).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'pos.manage.delete: Thai tea' }));
		expect(vi.mocked(setPosCatalog)).toHaveBeenCalledTimes(3);
		expect(vi.mocked(setPosCatalog).mock.calls[2][0].items).toHaveLength(0);
		expect(getPosCatalog).toHaveBeenCalled();
	});
});
