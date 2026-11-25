/**
 * TASK-5602 — scoped vitest for src/lib/pos/image-store.ts
 * Run scoped ONLY: npx vitest run src/lib/pos/image-store.test.ts --project=product
 * (L-P033 — never bare `npx vitest`)
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
	POS_IMAGES_DB_NAME,
	POS_IMAGES_DB_VERSION,
	POS_IMAGES_STORE,
	POS_IMAGE_MAX_EDGE,
	computeTargetSize,
	isSupportedImageType,
	pickOutputMime,
	downscaleImageBlob,
	saveProductImage,
	savePickedFile,
	getProductImage,
	getProductImageRecord,
	hasProductImage,
	deleteProductImage,
	countProductImages,
	clearProductImages,
	estimateImageQuota,
	resetImageDB,
	deleteImageDatabase
} from './image-store';

function makeBlob(size = 1024, type = 'image/jpeg'): Blob {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) bytes[i] = i % 256;
	return new Blob([bytes], { type });
}

beforeEach(async () => {
	resetImageDB();
	await deleteImageDatabase();
	resetImageDB();
});

afterAll(async () => {
	await deleteImageDatabase();
	resetImageDB();
});

describe('TASK-5602 isolation — separate DB from wallet', () => {
	it('uses pos-images DB v1, never lnw-cash', () => {
		expect(POS_IMAGES_DB_NAME).toBe('pos-images');
		expect(POS_IMAGES_DB_NAME).not.toBe('lnw-cash');
		expect(POS_IMAGES_DB_VERSION).toBe(1);
		expect(POS_IMAGES_STORE).toBe('images');
		expect(POS_IMAGES_STORE).not.toBe('transactions');
	});

	it('opens both DBs side by side with distinct stores', async () => {
		const { openDB } = await import('idb');
		// wallet DB untouched shape
		const wallet = await openDB('lnw-cash', 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('transactions')) {
					db.createObjectStore('transactions', { keyPath: 'id' });
				}
			}
		});
		expect(wallet.objectStoreNames.contains('transactions')).toBe(true);
		expect(wallet.objectStoreNames.contains('images')).toBe(false);
		wallet.close();
		// image put creates pos-images DB with images store only
		const r = await saveProductImage('iso-1', makeBlob(64));
		expect(r.ok).toBe(true);
		const images = await openDB(POS_IMAGES_DB_NAME, POS_IMAGES_DB_VERSION);
		expect(images.objectStoreNames.contains(POS_IMAGES_STORE)).toBe(true);
		expect(images.objectStoreNames.contains('transactions')).toBe(false);
		images.close();
		// cleanup wallet probe DB so we leave no residue
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase('lnw-cash');
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});
});

describe('computeTargetSize (256px long-edge cap — R5 supersedes 512)', () => {
	it('caps long edge at 256 preserving aspect', () => {
		expect(POS_IMAGE_MAX_EDGE).toBe(256);
		expect(computeTargetSize(1024, 768)).toEqual({ width: 256, height: 192 });
		expect(computeTargetSize(768, 1024)).toEqual({ width: 192, height: 256 });
		expect(computeTargetSize(256, 256)).toEqual({ width: 256, height: 256 });
	});
	it('never upscales smaller images', () => {
		expect(computeTargetSize(200, 100)).toEqual({ width: 200, height: 100 });
	});
	it('rejects bad dims with 0x0', () => {
		expect(computeTargetSize(0, 100)).toEqual({ width: 0, height: 0 });
		expect(computeTargetSize(-5, 100)).toEqual({ width: 0, height: 0 });
		expect(computeTargetSize(NaN, 100)).toEqual({ width: 0, height: 0 });
	});
});

describe('type helpers', () => {
	it('accepts image/* only', () => {
		expect(isSupportedImageType('image/jpeg')).toBe(true);
		expect(isSupportedImageType('image/webp')).toBe(true);
		expect(isSupportedImageType('image/png')).toBe(true);
		expect(isSupportedImageType('video/mp4')).toBe(false);
		expect(isSupportedImageType('')).toBe(false);
	});
	it('prefers webp when canvas supports it', () => {
		expect(pickOutputMime(true)).toBe('image/webp');
		expect(pickOutputMime(false)).toBe('image/jpeg');
	});
});

describe('downscaleImageBlob fallback (jsdom: no canvas bitmap)', () => {
	it('returns source blob untouched when canvas APIs missing', async () => {
		const src = makeBlob(256, 'image/png');
		const out = await downscaleImageBlob(src);
		expect(out.blob).toBe(src);
		expect(out.blob.size).toBe(256);
	});
});

describe('CRUD roundtrip (IndexedDB pos-images)', () => {
	it('save → get → has → count roundtrip', async () => {
		const blob = makeBlob(1024);
		const saved = await saveProductImage('p1', blob, { width: 512, height: 384 });
		expect(saved.ok).toBe(true);
		if (!saved.ok) throw new Error('save failed');
		expect(saved.value.productId).toBe('p1');
		expect(saved.value.byteSize).toBe(1024);

		expect(await hasProductImage('p1')).toBe(true);
		expect(await hasProductImage('missing')).toBe(false);

		const got = await getProductImage('p1');
		expect(got).toBeDefined();

		const rec = await getProductImageRecord('p1');
		expect(rec!.width).toBe(512);
		expect(rec!.height).toBe(384);
		// byteSize is a plain-data field (clone-safe); blob identity/size
		// comes back as a real Blob in browsers, fake-indexeddb may strip it
		expect(rec!.byteSize).toBe(1024);
		expect(rec!.mime).toBe('image/jpeg');

		expect(await countProductImages()).toBe(1);
	});

	it('upsert overwrites same productId', async () => {
		await saveProductImage('p1', makeBlob(100));
		await saveProductImage('p1', makeBlob(200));
		expect(await countProductImages()).toBe(1);
		expect((await getProductImageRecord('p1'))!.byteSize).toBe(200);
	});

	it('delete removes; missing id is no-op', async () => {
		await saveProductImage('p1', makeBlob(100));
		await deleteProductImage('p1');
		expect(await hasProductImage('p1')).toBe(false);
		expect(await getProductImage('p1')).toBeUndefined();
		await deleteProductImage('never-existed'); // must not throw
	});

	it('clear wipes all photos', async () => {
		await saveProductImage('a', makeBlob(10));
		await saveProductImage('b', makeBlob(10));
		expect(await countProductImages()).toBe(2);
		await clearProductImages();
		expect(await countProductImages()).toBe(0);
	});

	it('validation: empty productId / empty blob never stored', async () => {
		const r1 = await saveProductImage('', makeBlob(100));
		expect(r1.ok).toBe(false);
		if (!r1.ok) expect(r1.code).toBe('EMPTY_PRODUCT_ID');
		const r2 = await saveProductImage('p9', new Blob([], { type: 'image/jpeg' }));
		expect(r2.ok).toBe(false);
		if (!r2.ok) expect(r2.code).toBe('EMPTY_BLOB');
		expect(await countProductImages()).toBe(0);
	});
});

describe('savePickedFile (picker one-step: downscale then put)', () => {
	it('null file = failure, nothing stored (solar fallback path)', async () => {
		const r = await savePickedFile('p1', null);
		expect(r.ok).toBe(false);
		expect(await countProductImages()).toBe(0);
	});
	it('valid file stores a record', async () => {
		const r = await savePickedFile('p1', makeBlob(512));
		expect(r.ok).toBe(true);
		expect(await hasProductImage('p1')).toBe(true);
	});
});

describe('estimateImageQuota (read-only probe)', () => {
	function installStorageMock(
		estimate: () => Promise<{ usage?: number; quota?: number }>
	): void {
		Object.defineProperty(navigator, 'storage', {
			value: { estimate },
			configurable: true,
			writable: true
		});
	}
	it('returns supported:false when API missing', async () => {
		const nav = navigator as unknown as Record<string, unknown>;
		const had = nav.storage;
		Object.defineProperty(navigator, 'storage', {
			value: undefined,
			configurable: true,
			writable: true
		});
		const q = await estimateImageQuota();
		expect(q.supported).toBe(false);
		expect(q.usageRatio).toBe(0);
		Object.defineProperty(navigator, 'storage', {
			value: had,
			configurable: true,
			writable: true
		});
		vi.restoreAllMocks();
	});
	it('returns supported:false when estimate rejects', async () => {
		installStorageMock(() => Promise.reject(new Error('denied')));
		const q = await estimateImageQuota();
		expect(q.supported).toBe(false);
		expect(q.usageRatio).toBe(0);
		vi.restoreAllMocks();
	});
	it('maps usage/quota to ratio', async () => {
		installStorageMock(async () => ({
			usage: 50 * 1024 * 1024,
			quota: 500 * 1024 * 1024
		}));
		const q = await estimateImageQuota();
		expect(q.supported).toBe(true);
		expect(q.usageBytes).toBe(50 * 1024 * 1024);
		expect(q.quotaBytes).toBe(500 * 1024 * 1024);
		expect(q.usageRatio).toBeCloseTo(0.1);
		vi.restoreAllMocks();
	});
});
