/**
 * TASK-1502 (INTENT-013 v5.2 rev-locale-split F-050-002, BOSS-APPROVED mockup
 * rev-locale-split) — banner locale-split 1-line.
 *
 * WHAT THIS PROVES (dispatch must_do 1 + acceptance 1/2/4-part):
 *   1. banner copy บรรทัดเดียวแยกตาม locale ผ่าน $_() + locales th/en คู่:
 *      เครื่องไทยเห็นไทยบรรทัดเดียว / เครื่องอังกฤษเห็น EN บรรทัดเดียว —
 *      ไม่ปน TH+EN ในบรรทัดเดียว.
 *   2. keys เก่า offline.banner / offline.back_online (มี emoji) ถูกโละ —
 *      แทนด้วย keys ใหม่ไร้ emoji offline.banner_offline / banner_online.
 *   3. ไม่มี <small> sub ค้างใน banner (ตัดทิ้งตามคำบอส "เอาแค่บรรทัดเดียวพอ").
 *
 * Boss quotes (L-P008 verbatim — must_do 4):
 *   'banner ทำไมมีไทยปนอังกฤษ ไม่แยกตามการตั้งค่าของผู้ใช้'
 *
 * Scope: อ่าน locales JSON จริง + grep component — ไม่แตะ detector/store logic.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const en = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/en.json'), 'utf-8')) as Record<
	string,
	string
>;
const th = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/th.json'), 'utf-8')) as Record<
	string,
	string
>;
const bannerSrc = readFileSync(
	resolve(REPO_ROOT, 'src/components/OfflineIndicator.svelte'),
	'utf-8'
);

const TH_RE = /[\u0E00-\u0E7F]/;
const EN_RE = /[A-Za-z]/;

describe('TASK-1502 — banner locale-split 1-line (INTENT-013 v5.2)', () => {
	it('keys ใหม่ไร้ emoji มีคู่ th/en (offline.banner_offline / banner_online)', () => {
		for (const key of ['offline.banner_offline', 'offline.banner_online']) {
			expect(th[key], `th missing ${key}`).toBeTruthy();
			expect(en[key], `en missing ${key}`).toBeTruthy();
			expect(th[key]).not.toMatch(/🔴|🟢/);
			expect(en[key]).not.toMatch(/🔴|🟢/);
		}
	});

	it('TH เห็นไทยบรรทัดเดียว — ไม่ปน EN', () => {
		for (const key of ['offline.banner_offline', 'offline.banner_online']) {
			expect(th[key]).toMatch(TH_RE);
			expect(th[key]).not.toMatch(EN_RE);
		}
	});

	it('EN เห็นอังกฤษบรรทัดเดียว — ไม่ปน TH', () => {
		for (const key of ['offline.banner_offline', 'offline.banner_online']) {
			expect(en[key]).toMatch(EN_RE);
			expect(en[key]).not.toMatch(TH_RE);
		}
	});

	it('copy ตรง mockup rev-locale-split ที่ approve', () => {
		expect(th['offline.banner_offline']).toBe('ออฟไลน์ — กำลังรอการเชื่อมต่อ');
		expect(th['offline.banner_online']).toBe('กลับออนไลน์แล้ว — กำลังซิงก์');
		expect(en['offline.banner_offline']).toBe('Offline — waiting to reconnect');
		expect(en['offline.banner_online']).toBe('Back online — syncing');
	});

	it('keys เก่ามี emoji ถูกโละ (offline.banner / back_online ว่าง)', () => {
		expect(th['offline.banner']).toBeUndefined();
		expect(th['offline.back_online']).toBeUndefined();
		expect(en['offline.banner']).toBeUndefined();
		expect(en['offline.back_online']).toBeUndefined();
	});

	it('component ใช้ $_() keys ใหม่ — ไม่มี hardcode TH/EN ปน + ไม่มี sub', () => {
		expect(bannerSrc).toContain("$_('offline.banner_offline')");
		expect(bannerSrc).toContain("$_('offline.banner_online')");
		// ไม่มี <small> sub ค้างใน banner (ตัดทิ้งแล้ว)
		expect(bannerSrc).not.toMatch(/<small>/);
		// ไม่มี emoji ใน component
		expect(bannerSrc).not.toMatch(/🔴|🟢/);
	});
});
