/**
 * TASK-1407 (INTENT-013 rev19 ทาง ข) — History badge + reactive.
 *
 * WHAT THIS PROVES (dispatch must_do 1-3 + acceptance 1/2/4-part):
 *   1. pending เป็น badge เต็มตัว: `.tx-status-badge.status-pending`
 *      (reuse โครง tx-status-badge — กรอบเหมือน confirmed/failed) และ
 *      `.tx-pending-indicator` เดิมหายจาก DOM (ตัด icon+text เดิม).
 *   2. flip pending→confirmed บน UI โดยไม่รีเฟรช: confirmed-online event
 *      ยิง → History รอ flush drain (mock จำลอง settle จริงของ
 *      TASK-1402/1403: flip record ใน DB) → reload → badge เปลี่ยน
 *      pending→confirmed — data-driven จาก record status ล้วน ไม่ hardcode.
 *   3. ห้าม polling/interval: History.svelte ไม่มี setInterval/setTimeout
 *      เพิ่มเติม (ตรวจผ่าน grep ใน proof) — ทางนี้เป็น event-driven ล้วน.
 *
 * Boss quote (L-P008 verbatim — must_do 5):
 *   'คือผมอยากให้มีการแสดงผ่าน badge ของ tx ได้มั้ย'
 *
 * Scope: อ่าน status จาก record อย่างเดียว — ไม่แตะ detector/store
 * logic/client.ts (mock แค่ขอบ event + drain เพื่อจำลอง flush settle).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte/svelte5';
import History from '../../screens/History.svelte';
import {
	addTransaction,
	clearTransactions,
	getTransactionById
} from '$lib/storage/db';

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

// Confirmed-online subscribers — partial mock: keep every real export
// (transitive graph needs setProbeTargets etc.), capture only callbacks.
const onlineConfirmedCbs: Array<() => void> = [];
vi.mock('$lib/offline-indicator', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/offline-indicator')>();
	return {
		...actual,
		onOnlineConfirmed: (cb: () => void) => {
			onlineConfirmedCbs.push(cb);
			return () => {};
		}
	};
});

// Simulated flush drain: mirrors the real TASK-1402/1403 settle pass
// (flushPendingNormalizeOnBackOnline → settlePendingReceiveTxs flips the
// mapped tx record confirmed/failed) — the UI must reload AFTER it.
vi.mock('$lib/wallet/normalizeWiring', () => ({
	runFlushDrain: async () => {
		const { updateTransaction } = await import('$lib/storage/db');
		await updateTransaction('tx-1407-pending', { status: 'confirmed' });
		return null;
	}
}));

const PENDING_TX = {
	id: 'tx-1407-pending',
	type: 'cashu_receive' as const,
	protocol: 'cashu' as const,
	amount: 25000,
	mint_url: 'https://mint.1407.test',
	timestamp: Date.now(),
	token_hash: 'token-1407',
	status: 'pending' as const,
	fee: 0,
	proofIds: ['proof-1407-a', 'proof-1407-b']
};

describe('TASK-1407 — History badge + reactive (INTENT-013 rev19 ทาง ข)', () => {
	beforeEach(async () => {
		onlineConfirmedCbs.length = 0;
		await clearTransactions();
		await addTransaction({ ...PENDING_TX });
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await clearTransactions();
	});

	it("pending เป็น badge เต็มตัว (status-pending) — ตัด tx-pending-indicator เดิม — 'คือผมอยากให้มีการแสดงผ่าน badge ของ tx ได้มั้ย' (L-P008)", async () => {
		const { container } = render(History);

		await vi.waitFor(() => {
			const badge = container.querySelector('.tx-status-badge.status-pending');
			expect(badge).not.toBeNull();
		});

		const badge = container.querySelector('.tx-status-badge.status-pending');
		// data-driven จาก record: label มาจาก status 'pending' ผ่าน statusLabel
		// (i18n mock คืน key ตรง ๆ)
		expect(badge?.textContent).toContain('screen.history.status_pending');
		// icon+text เดิมถูกตัด — ต้องไม่มีใน DOM
		expect(container.querySelector('.tx-pending-indicator')).toBeNull();
		expect(container.querySelector('.pending-text')).toBeNull();
	});

	it('flip pending→confirmed บน UI โดยไม่รีเฟรช (event → drain → reload)', async () => {
		const { container } = render(History);

		// เริ่ม: pending badge เต็มตัว
		await vi.waitFor(() => {
			expect(container.querySelector('.tx-status-badge.status-pending')).not.toBeNull();
		});
		expect(onlineConfirmedCbs.length).toBeGreaterThan(0);

		// flush สำเร็จยิง event → History รอ drain (flip record) แล้ว reload
		onlineConfirmedCbs.forEach((cb) => cb());

		await vi.waitFor(() => {
			expect(container.querySelector('.tx-status-badge.status-confirmed')).not.toBeNull();
		});

		// record ต้นทาง flip จริง + UI ตาม (data-driven ไม่ hardcode)
		const record = await getTransactionById('tx-1407-pending');
		expect(record?.status).toBe('confirmed');
		expect(container.querySelector('.tx-status-badge.status-pending')).toBeNull();
		const badge = container.querySelector('.tx-status-badge.status-confirmed');
		expect(badge?.textContent).toContain('screen.history.status_confirmed');
	});
});
