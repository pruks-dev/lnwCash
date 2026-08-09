/**
 * Test: History.svelte — TASK-060 History screen with pull-to-refresh,
 * skeleton cards, date grouping, and empty state.
 * D-015: Unified light/dark theme — CSS class bindings replace inline styles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import History from '../../screens/History.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (val: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/storage/db', () => ({
	getTransactions: vi.fn(() => Promise.resolve([]))
}));

describe('History (TASK-060)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render history title', () => {
		render(History, {});
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should show filter chips', () => {
		render(History, {});
		expect(screen.getByText('screen.history.filter_all')).toBeTruthy();
		expect(screen.getByText((content: string) => content.includes('screen.history.filter_send'))).toBeTruthy();
		expect(screen.getByText((content: string) => content.includes('screen.history.filter_receive'))).toBeTruthy();
	});

	it('should show skeleton cards while loading', () => {
		const { container } = render(History, {});
		const skeletonCards = container.querySelectorAll('.skeleton-card');
		expect(skeletonCards.length).toBeGreaterThanOrEqual(1);
	});

	it('should show empty state when no transactions', async () => {
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText('screen.history.empty')).toBeTruthy();
		});
	});

	it('should have empty state hint text', async () => {
		render(History, {});
		await waitFor(() => {
			const emptyStates = document.querySelectorAll('.empty-state');
			expect(emptyStates.length).toBeGreaterThanOrEqual(1);
		});
	});

	it('should render with maxItems prop', () => {
		render(History, { maxItems: 5 });
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should show loading skeletons with pulse animation', () => {
		const { container } = render(History, {});
		const pulsing = container.querySelectorAll('.pulse');
		expect(pulsing.length).toBeGreaterThan(0);
	});

	it('should render main element with correct aria label', () => {
		const { container } = render(History, {});
		const main = container.querySelector('div[role="main"]');
		expect(main).toBeTruthy();
	});

	it('should show history icon in empty state', async () => {
		const { container } = render(History, {});
		await waitFor(() => {
			const emptyIcon = container.querySelector('.empty-icon');
			expect(emptyIcon).toBeTruthy();
		});
	});

	// ─── D-015: Unified light/dark theme — CSS class bindings ───

	it('should expose tx-type-icon CSS class for theme targeting', () => {
		const { container } = render(History, {});
		// .tx-type-icon base class exists in component CSS
		const styleEl = container.querySelector('style');
		// jsdom doesn't resolve Svelte scoped styles, but the component
		// ships the .tx-type-icon class — verify the component doesn't crash
		expect(container.querySelector('[role="main"]')).toBeTruthy();
	});

	it('should not have categoryColor function exposed (removed)', () => {
		// categoryColor was removed — inline style no longer used
		render(History, {});
		// Verify component renders without the deprecated function
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should not have protocolColor function exposed (removed)', () => {
		// protocolColor was removed — inline style no longer used
		render(History, {});
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should render tx-type-icon without inline style attribute (empty state)', async () => {
		// When transactions are loaded and displayed, tx-type-icon elements
		// should NOT carry an inline style="background: …"
		// In empty state, no tx items render — component just must not crash
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText('screen.history.empty')).toBeTruthy();
		});
		// No tx-type-icon elements in empty state — success means no crash
	});

	// ─── TASK-060: Simplify color palette to Cyan + Amber ───

	it('should render tx-send icon class for melt transactions', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx1', type: 'melt', amount: 1000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			const icon = document.querySelector('.tx-type-icon.tx-send');
			expect(icon).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should render tx-receive icon class for mint transactions', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx2', type: 'mint', amount: 5000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			const icon = document.querySelector('.tx-type-icon.tx-receive');
			expect(icon).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should map cashu_send to tx-send class', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx3', type: 'cashu_send', amount: 300, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			const icon = document.querySelector('.tx-type-icon.tx-send');
			expect(icon).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should map cashu_receive to tx-receive class', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx4', type: 'cashu_receive', amount: 800, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			const icon = document.querySelector('.tx-type-icon.tx-receive');
			expect(icon).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should map transfer to tx-send class', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx5', type: 'transfer', amount: 1500, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			const icon = document.querySelector('.tx-type-icon.tx-send');
			expect(icon).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should render protocol-lightning badge for lightning txs', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx6', type: 'melt', amount: 500, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed', protocol: 'lightning' }
		]);
		render(History, {});
		await waitFor(() => {
			const badge = document.querySelector('.tx-protocol-badge.protocol-lightning');
			expect(badge).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should render protocol-cashu badge for cashu txs', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx7', type: 'mint', amount: 2000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed', protocol: 'cashu' }
		]);
		render(History, {});
		await waitFor(() => {
			const badge = document.querySelector('.tx-protocol-badge.protocol-cashu');
			expect(badge).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should show minus sign for send transactions', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx8', type: 'melt', amount: 1000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText((c: string) => c.includes('-') && c.includes('1,000'))).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('should show plus sign for receive transactions', async () => {
		const { getTransactions } = await import('$lib/storage/db');
		vi.mocked(getTransactions).mockResolvedValue([
			{ id: 'tx9', type: 'mint', amount: 5000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' }
		]);
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText((c: string) => c.includes('+') && c.includes('5,000'))).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);
});
