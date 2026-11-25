/**
 * TASK-5602 — PoS product image store (INTENT-056 BLUEPRINT-056-v2)
 *
 * Separate IndexedDB database `pos-images`, deliberately ISOLATED from
 * the wallet database `lnw-cash` (store `transactions`, DB_VERSION 1).
 * This file NEVER imports storage/db.ts and NEVER touches DB_VERSION there.
 *
 * Rules (task FORBIDDEN scope):
 * - photo blobs live in IndexedDB ONLY — never in string key-value storage
 *   (no setItem/getItem anywhere in this file)
 * - NO origin-file-system prod code — the storage-mechanism comparison lives
 *   in the evidence doc only (see TASK-5602 evidence bundle)
 * - NO custom icon — UI fallback is solar linear via Icon.svelte (Box), owned by picker
 * - resize to max 256px (long edge) → JPEG/WebP blob BEFORE put
 *   (R5: box is 72px, x2 retina = 144px — 256px is plenty sharp)
 * - R4 limits kept: input >15MB rejected (never decoded) · store WebP q0.5
 *   (≈20–60KB) · 1 product = 1 photo (put upserts by productId) ·
 *   quota ≥80% warns (non-blocking)
 * - R5 resize: single-step browser shortcut
 *   createImageBitmap(file, { resizeWidth, resizeHeight, resizeQuality: 'high' })
 *   (decode+scale in one) — no manual drawImage scaling; legacy drawImage
 *   path kept as fallback for browsers without resize-options support
 * - R4 perf: heavy decode/draw/encode yields to the event loop (yieldToUI)
 *   so the busy spinner paints first — no main-thread long task
 * - no photo = no record = caller renders solar fallback, nothing stored
 */

import { openDB, type IDBPDatabase } from 'idb';

/** Separate DB name — must NOT equal 'lnw-cash'. */
export const POS_IMAGES_DB_NAME = 'pos-images';
/** Own version counter — independent of lnw-cash DB_VERSION. */
export const POS_IMAGES_DB_VERSION = 1;
export const POS_IMAGES_STORE = 'images';

/** Long-edge cap after downscale (px). R5: 256 (box 72px x2 retina). */
export const POS_IMAGE_MAX_EDGE = 256;
/** Output mime preference order: WebP when supported, else JPEG. */
export const POS_IMAGE_MIME_WEBP = 'image/webp';
export const POS_IMAGE_MIME_JPEG = 'image/jpeg';
/** Encoder quality for canvas.toBlob / OffscreenCanvas.convertToBlob. */
export const POS_IMAGE_QUALITY = 0.5;
/** R4 — input gate: files larger than 15MB are rejected with a message,
 * never decoded (protects low-end devices from OOM on huge photos). */
export const POS_IMAGE_MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** R4 — quota warn threshold: usage/quota ratio at/above this shows
 * a "storage nearly full" note (non-blocking, save still succeeds). */
export const QUOTA_WARN_RATIO = 0.8;
/** R4 — Thai user-facing strings (picker surfaces these via onError/note). */
export const FILE_TOO_LARGE_MESSAGE = 'รูปใหญ่เกิน 15MB — เลือกรูปที่เล็กกว่านี้';
export const QUOTA_NEAR_FULL_MESSAGE = 'ที่เก็บรูปใกล้เต็มแล้ว — ลบรูปสินค้าที่ไม่ใช้เพื่อเพิ่มพื้นที่';
export const RESIZING_MESSAGE = 'กำลังย่อรูป…';

export interface ProductImageRecord {
	/** keyPath — the catalog product id this photo belongs to. */
	productId: string;
	/** Downscaled image blob (≤256px long edge, JPEG/WebP). */
	blob: Blob;
	/** Mime of blob (image/webp | image/jpeg | source passthrough). */
	mime: string;
	/** Stored pixel dims after downscale. */
	width: number;
	height: number;
	/** blob.size at put time. */
	byteSize: number;
	/** Device epoch ms of last write. */
	updatedAt: number;
}

export type ImageStoreErrorCode =
	| 'EMPTY_PRODUCT_ID'
	| 'EMPTY_BLOB'
	| 'BAD_DIMENSIONS'
	| 'FILE_TOO_LARGE'
	| 'NOT_FOUND';

export interface ImageStoreFailure {
	ok: false;
	code: ImageStoreErrorCode;
	message: string;
}
export interface ImageStoreOk<T> {
	ok: true;
	value: T;
}
export type ImageStoreResult<T> = ImageStoreOk<T> | ImageStoreFailure;

function fail(code: ImageStoreErrorCode, message: string): ImageStoreFailure {
	return { ok: false, code, message };
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbInstance: IDBPDatabase | null = null;

async function getImageDB(): Promise<IDBPDatabase> {
	if (dbInstance) return dbInstance;
	if (!dbPromise) {
		dbPromise = openDB(POS_IMAGES_DB_NAME, POS_IMAGES_DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(POS_IMAGES_STORE)) {
					db.createObjectStore(POS_IMAGES_STORE, { keyPath: 'productId' });
				}
			}
		});
	}
	dbInstance = await dbPromise;
	return dbInstance;
}

/** Reset connection (tests). Closes the live handle first — dropping the ref
 * without closing leaves a pending-delete block behind in fake-indexeddb
 * (and in real browsers) so the next deleteDatabase never fires. */
export function resetImageDB(): void {
	if (dbInstance) {
		try {
			dbInstance.close();
		} catch {
			// ignore close errors during test reset
		}
		dbInstance = null;
	}
	dbPromise = null;
}

/** Delete the whole pos-images database (test teardown). */
export async function deleteImageDatabase(): Promise<void> {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
	dbPromise = null;
	await new Promise<void>((resolve) => {
		const req = indexedDB.deleteDatabase(POS_IMAGES_DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
		req.onblocked = () => resolve();
	});
}

/**
 * Pure math: fit (w,h) inside maxEdge preserving aspect ratio.
 * Never upscales — smaller images keep their size.
 */
export function computeTargetSize(
	w: number,
	h: number,
	maxEdge: number = POS_IMAGE_MAX_EDGE
): { width: number; height: number } {
	if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
		return { width: 0, height: 0 };
	}
	const longEdge = Math.max(w, h);
	if (longEdge <= maxEdge) return { width: Math.round(w), height: Math.round(h) };
	const scale = maxEdge / longEdge;
	return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Accept-list for picker input (mirrors `accept="image/*"`). */
export function isSupportedImageType(mime: string): boolean {
	return typeof mime === 'string' && mime.toLowerCase().startsWith('image/');
}

/**
 * R4 — yield to the browser event loop so the picker's busy spinner paints
 * BEFORE heavy decode starts (anti long-task/Violation 185ms).
 * Double-rAF lets the browser paint first; setTimeout(0) fallback covers
 * jsdom/tests and browsers without rAF. Resolves fast, never rejects.
 */
export function yieldToUI(): Promise<void> {
	return new Promise((resolve) => {
		try {
			const raf = (globalThis as unknown as { requestAnimationFrame?: unknown })
				.requestAnimationFrame;
			if (typeof raf === 'function') {
				(raf as (cb: () => void) => void)(() =>
					(raf as (cb: () => void) => void)(() => resolve())
				);
				return;
			}
		} catch {
			// fall through to timer
		}
		setTimeout(resolve, 0);
	});
}

/** Pick output mime: WebP when canvas supports it, else JPEG. */
export function pickOutputMime(canvasSupportsWebp: boolean): string {
	return canvasSupportsWebp ? POS_IMAGE_MIME_WEBP : POS_IMAGE_MIME_JPEG;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	mime: string,
	quality: number
): Promise<Blob | null> {
	return new Promise((resolve) => {
		try {
			canvas.toBlob((b) => resolve(b), mime, quality);
		} catch {
			resolve(null);
		}
	});
}

async function detectWebpSupport(): Promise<boolean> {
	try {
		if (typeof document === 'undefined') return false;
		const c = document.createElement('canvas');
		if (!c.getContext('2d')) return false;
		const blob = await canvasToBlob(c, POS_IMAGE_MIME_WEBP, 0.5);
		return !!blob && blob.type === POS_IMAGE_MIME_WEBP;
	} catch {
		return false;
	}
}

/**
 * R5 — single-step browser resize via createImageBitmap resize options.
 * Downscale an image blob to ≤256px long edge, returning an encoded blob.
 * Fast path: createImageBitmap(file, { resizeWidth, resizeHeight,
 * resizeQuality: 'high' }) decodes+scales in ONE browser shortcut —
 * no manual drawImage scaling. drawImage remains only as a 1:1 blit
 * (fast path) or the legacy scale step (fallback path, R4 behavior).
 * Fallback 1 (resize options unsupported — older browsers): legacy
 * createImageBitmap(file) + canvas drawImage scale. Never throws.
 * Fallback 2 (no canvas APIs at all — e.g. jsdom): returns the SOURCE blob
 * untouched so put() still works; dims fall back to 0x0 and caller stores.
 */
export async function downscaleImageBlob(
	source: Blob,
	opts?: { maxEdge?: number; quality?: number }
): Promise<{ blob: Blob; mime: string; width: number; height: number }> {
	const maxEdge = opts?.maxEdge ?? POS_IMAGE_MAX_EDGE;
	const quality = opts?.quality ?? POS_IMAGE_QUALITY;
	const passthrough = (): { blob: Blob; mime: string; width: number; height: number } => ({
		blob: source,
		mime: source.type || 'image/jpeg',
		width: 0,
		height: 0
	});
	const canResize =
		typeof createImageBitmap === 'function' && typeof document !== 'undefined';
	if (!canResize) {
		return passthrough();
	}
	try {
		// Intrinsic dims first (probe bitmap is closed right after).
		const probe = await createImageBitmap(source);
		const natural = { width: probe.width, height: probe.height };
		const target = computeTargetSize(natural.width, natural.height, maxEdge);
		if (target.width <= 0 || target.height <= 0) {
			probe.close?.();
			return passthrough();
		}
		const needsScale =
			target.width !== natural.width || target.height !== natural.height;
		let bitmap: ImageBitmap;
		// True only when the browser itself produced the scaled pixels —
		// then the canvas blit below is 1:1 (no manual scaling).
		let scaledByBrowser = false;
		if (!needsScale) {
			// Already ≤ cap — keep the probe, no second decode (never upscale).
			bitmap = probe;
		} else {
			probe.close?.();
			try {
				// R5 fast path: decode+resize in one browser step.
				bitmap = await createImageBitmap(source, {
					resizeWidth: target.width,
					resizeHeight: target.height,
					resizeQuality: 'high'
				});
				scaledByBrowser = true;
			} catch {
				// Older browser without resize-options support → legacy R4 path.
				bitmap = await createImageBitmap(source);
			}
		}
		// R4 kept: yield so the busy spinner gets a paint slot before encode.
		await yieldToUI();
		const canvas = document.createElement('canvas');
		if (scaledByBrowser) {
			// Trust the browser's output dims; blit 1:1 for encoding only.
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
		} else {
			canvas.width = target.width;
			canvas.height = target.height;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			bitmap.close?.();
			return passthrough();
		}
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const outWidth = canvas.width;
		const outHeight = canvas.height;
		bitmap.close?.();
		// R4 kept: yield again before the async encode.
		await yieldToUI();
		const webpOk = await detectWebpSupport();
		const mime = pickOutputMime(webpOk);
		const out = await canvasToBlob(canvas, mime, quality);
		if (!out) {
			return passthrough();
		}
		return { blob: out, mime: out.type || mime, width: outWidth, height: outHeight };
	} catch {
		return passthrough();
	}
}

/**
 * Save (upsert) a product photo. Caller MUST pass an already-downscaled blob
 * (use downscaleImageBlob on the picker File first). Stores nothing else.
 */
export async function saveProductImage(
	productId: string,
	blob: Blob,
	meta?: { width?: number; height?: number; mime?: string }
): Promise<ImageStoreResult<ProductImageRecord>> {
	if (!productId || productId.trim() === '') {
		return fail('EMPTY_PRODUCT_ID', 'productId is required');
	}
	if (!blob || blob.size === 0) {
		return fail('EMPTY_BLOB', 'image blob is empty — nothing stored (solar fallback applies)');
	}
	const db = await getImageDB();
	const record: ProductImageRecord = {
		productId,
		blob,
		mime: meta?.mime ?? blob.type ?? POS_IMAGE_MIME_JPEG,
		width: meta?.width ?? 0,
		height: meta?.height ?? 0,
		byteSize: blob.size,
		updatedAt: Date.now()
	};
	await db.put(POS_IMAGES_STORE, record);
	return { ok: true, value: record };
}

/**
 * One-step helper for the picker: downscale a picked File then put.
 * Empty/invalid input → failure, never writes (solar fallback path).
 * R4 limits (kept by R5):
 * - input > 15MB → FILE_TOO_LARGE, never decoded/stored (1 product 1 photo
 *   still holds: put() upserts by productId keyPath, overwriting the old one)
 * - store path: ≤256px long edge, WebP q0.5 (≈20–60KB typical)
 */
export async function savePickedFile(
	productId: string,
	file: Blob | null | undefined
): Promise<ImageStoreResult<ProductImageRecord>> {
	if (!file || file.size === 0) {
		return fail('EMPTY_BLOB', 'no file picked — keep solar fallback, nothing stored');
	}
	if (file.size > POS_IMAGE_MAX_INPUT_BYTES) {
		return fail('FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
	}
	// R4: yield before heavy decode so the caller's busy UI paints first.
	await yieldToUI();
	const down = await downscaleImageBlob(file);
	return saveProductImage(productId, down.blob, {
		width: down.width,
		height: down.height,
		mime: down.mime
	});
}

/** Load photo blob for a product — undefined = no photo = render solar fallback. */
export async function getProductImage(productId: string): Promise<Blob | undefined> {
	const rec = await getProductImageRecord(productId);
	return rec?.blob;
}

/** Load full record (dims + mime for <img> sizing). */
export async function getProductImageRecord(
	productId: string
): Promise<ProductImageRecord | undefined> {
	if (!productId) return undefined;
	const db = await getImageDB();
	return (await db.get(POS_IMAGES_STORE, productId)) as ProductImageRecord | undefined;
}

/** True when a photo exists (to choose <img> vs solar Box fallback). */
export async function hasProductImage(productId: string): Promise<boolean> {
	return (await getProductImageRecord(productId)) !== undefined;
}

/** Remove a product photo (e.g. product deleted). Missing id = no-op success. */
export async function deleteProductImage(productId: string): Promise<void> {
	if (!productId) return;
	const db = await getImageDB();
	await db.delete(POS_IMAGES_STORE, productId);
}

/** Count stored photos (quota/debug UI). */
export async function countProductImages(): Promise<number> {
	const db = await getImageDB();
	return db.count(POS_IMAGES_STORE);
}

/** Clear all photos (settings reset). */
export async function clearProductImages(): Promise<void> {
	const db = await getImageDB();
	await db.clear(POS_IMAGES_STORE);
}

export interface ImageQuotaInfo {
	/** Bytes used by origin storage (IndexedDB + caches), if exposed. */
	usageBytes: number;
	/** Origin quota bytes, if exposed. */
	quotaBytes: number;
	/** usage/quota ratio 0..1 (0 when unknown). */
	usageRatio: number;
	/** False when navigator.storage.estimate is unavailable (e.g. old webview). */
	supported: boolean;
}

/**
 * Quota probe — read-only navigator.storage.estimate().
 * Never writes; lets PoS settings show "photos X MB / Y MB".
 */
export async function estimateImageQuota(): Promise<ImageQuotaInfo> {
	try {
		const nav = typeof navigator !== 'undefined' ? navigator : undefined;
		const storage = nav?.storage;
		if (!storage || typeof storage.estimate !== 'function') {
			return { usageBytes: 0, quotaBytes: 0, usageRatio: 0, supported: false };
		}
		const est = await storage.estimate();
		const usageBytes = est.usage ?? 0;
		const quotaBytes = est.quota ?? 0;
		return {
			usageBytes,
			quotaBytes,
			usageRatio: quotaBytes > 0 ? usageBytes / quotaBytes : 0,
			supported: true
		};
	} catch {
		return { usageBytes: 0, quotaBytes: 0, usageRatio: 0, supported: false };
	}
}

/**
 * R4 — quota near-full warn predicate (pure, testable).
 * Unknown/unsupported probe → false (never nag when we cannot measure).
 */
export function isQuotaNearFull(info: ImageQuotaInfo): boolean {
	return info.supported && info.usageRatio >= QUOTA_WARN_RATIO;
}
