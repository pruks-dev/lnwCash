/**
 * Cashu mint HTTP client — supports multi-mint (mint URL passed as parameter every call).
 * Never hardcodes any mint URL.
 */

import type {
	MintInfo,
	MintKeys,
	MintKeyset,
	MintQuote,
	MeltQuote,
	PostMintResponse,
	PostMeltResponse,
	CheckStateProof,
	CheckStateResponse,
	CachedEndpoint,
	Nut4Settings,
	Nut5Settings,
	Nut19Settings
} from '../types';

import { hash_to_curve } from './blind';
import { utf8ToBytes } from '@noble/hashes/utils.js';

// ─── NUT-09: Restore types ───────────────────────────────────

/** A blinded output sent to POST /v1/restore (amount is a placeholder). */
export interface RestoreBlindedMessage {
	amount: number;
	id: string;
	B_: string;
}

/** A blind signature returned by POST /v1/restore. */
export interface RestoreBlindSignature {
	id: string;
	amount: number;
	C_: string;
	dleq?: { e: string; s: string };
}

/** POST /v1/restore response (outputs + signatures aligned 1:1). */
export interface PostRestoreResponse {
	outputs?: RestoreBlindedMessage[];
	signatures: RestoreBlindSignature[];
}

// ─── Error types ─────────────────────────────────────────────

export class CashuError extends Error {
	/**
	 * NUT error codes that represent a benign (idempotent double-submit) mint
	 * response rather than a real failure:
	 *   - 11003: output already signed (double-submit of mint outputs)
	 *   - 20002: quote already issued (double-submit of a mint/melt quote)
	 */
	static readonly BENIGN_CODES: ReadonlySet<number> = new Set([11003, 20002]);

	constructor(
		message: string,
		public status?: number,
		public code?: number | string
	) {
		super(message);
		this.name = 'CashuError';
	}

	/** True when this error is a benign (idempotent double-submit) mint response. */
	get isBenign(): boolean {
		if (this.code === undefined || this.code === null) return false;
		const numeric = typeof this.code === 'string' ? Number(this.code) : this.code;
		return Number.isFinite(numeric) && CashuError.BENIGN_CODES.has(numeric);
	}
}

export class MintUnreachableError extends CashuError {
	constructor(mintUrl: string, cause?: Error) {
		super(`Mint unreachable: ${mintUrl}${cause ? ` — ${cause.message}` : ''}`);
		this.name = 'MintUnreachableError';
	}
}

export class NetworkError extends CashuError {
	constructor(cause?: Error) {
		super(`Network error${cause ? `: ${cause.message}` : ''}`);
		this.name = 'NetworkError';
	}
}

export class InvalidResponseError extends CashuError {
	constructor(mintUrl: string, details?: string) {
		super(`Invalid response from ${mintUrl}${details ? `: ${details}` : ''}`);
		this.name = 'InvalidResponseError';
	}
}

// ─── Endpoint Path Resolution ─────────────────────────────────

/** Default standard NUT paths — fallback when mint info lacks NUT-19 cached_endpoints */
const STANDARD_PATHS: Record<string, string> = {
	mint_info: '/v1/info',
	keysets: '/v1/keysets',
	keys: '/v1/keys',
	mint_quote: '/v1/mint/quote/bolt11',
	mint_operation: '/v1/mint/bolt11',
	melt_quote: '/v1/melt/quote/bolt11',
	melt_operation: '/v1/melt/bolt11',
	check_state: '/v1/checkstate',
	swap: '/v1/swap',
	/** NUT-09: restore previously-issued blind signatures (TASK-206) */
	restore: '/v1/restore',
	/** TASK-084: quote status check endpoints */
	mint_quote_check: '/v1/mint/quote/bolt11',
	melt_quote_check: '/v1/melt/quote/bolt11',
};

/**
 * Extract the first supported payment method name from NUT-04 (mint)
 * or NUT-05 (melt) settings. Returns undefined if undeclared.
 */
function getSupportedPaymentMethod(mintInfo: MintInfo, nut: '4' | '5'): string | undefined {
	const nutSettings = mintInfo.nuts?.[nut];
	if (!nutSettings) return undefined;

	// Cast to known shapes that carry `.methods`
	const methods = (nutSettings as Nut4Settings | Nut5Settings).methods;
	if (methods && methods.length > 0) {
		return methods[0].method;
	}
	return undefined;
}

/**
 * Resolve an **operation** endpoint path from NUT-19 cached_endpoints.
 * Falls back to the standard NUT path when cached_endpoints is missing or empty.
 *
 * Matching: finds the first cached endpoint whose path contains one of
 * the given keywords AND does NOT contain "/quote/" (quote endpoints are
 * handled separately by resolveQuotePath).
 */
function resolveOperationPath(
	mintInfo: MintInfo | undefined,
	httpMethod: string,
	standardPath: string,
	pathKeywords: string[]
): string {
	if (!mintInfo?.nuts) return standardPath;

	const nut19 = mintInfo.nuts['19'] as Nut19Settings | undefined;
	if (!nut19?.cached_endpoints || nut19.cached_endpoints.length === 0) {
		return standardPath;
	}

	// Match by HTTP method + path contains a keyword + NOT a quote path
	const cached = nut19.cached_endpoints.find(
		(ep: CachedEndpoint) =>
			ep.method.toUpperCase() === httpMethod.toUpperCase() &&
			!ep.path.includes('/quote/') &&
			pathKeywords.some(kw => ep.path.includes(kw))
	);

	return cached?.path ?? standardPath;
}

/**
 * Resolve a **quote** endpoint path.
 *
 * Quote endpoints are typically NOT advertised in NUT-19 cached_endpoints.
 * Resolution strategy:
 *  1. Check cached_endpoints anyway (some mints may include them)
 *  2. Construct from NUT-04/05 methods:  /v1/{action}/quote/{method}
 *  3. Fallback to standard NUT path
 */
function resolveQuotePath(
	mintInfo: MintInfo | undefined,
	action: 'mint' | 'melt',
	nutNumber: '4' | '5',
	standardPath: string
): string {
	if (!mintInfo?.nuts) return standardPath;

	// Step 1 — check cached_endpoints
	const nut19 = mintInfo.nuts['19'] as Nut19Settings | undefined;
	if (nut19?.cached_endpoints) {
		const cached = nut19.cached_endpoints.find(
			(ep: CachedEndpoint) =>
				ep.method.toUpperCase() === 'POST' && ep.path.includes('/quote/')
		);
		if (cached) return cached.path;
	}

	// Step 2 — construct from NUT-04/05 payment method
	const paymentMethod = getSupportedPaymentMethod(mintInfo, nutNumber);
	if (paymentMethod) {
		return `/v1/${action}/quote/${paymentMethod}`;
	}

	// Step 3 — fallback to standard NUT path
	return standardPath;
}

/**
 * Public helper — resolve an endpoint path for a given logical operation.
 *
 * Uses NUT-19 cached_endpoints (for operations) and NUT-04/05 method
 * declarations (for quotes) when `mintInfo` is provided.
 * Falls back to standard NUT-0{2,4,5,6} paths when mintInfo is absent.
 *
 * @param mintInfo   Full mint info from GET /v1/info (optional)
 * @param operationKey Logical operation key
 * @returns Resolved API path (e.g. "/v1/mint/bolt11")
 */
export function resolveEndpointPath(
	mintInfo: MintInfo | undefined,
	operationKey:
		| 'mint_operation'
		| 'mint_quote'
		| 'melt_operation'
		| 'melt_quote'
		| 'swap'
		| 'restore'
): string {
	const standardPath = STANDARD_PATHS[operationKey] ?? '/v1/info';

	if (!mintInfo) return standardPath;

	switch (operationKey) {
		case 'mint_operation':
			return resolveOperationPath(mintInfo, 'POST', standardPath, ['/mint']);

		case 'mint_quote':
			return resolveQuotePath(mintInfo, 'mint', '4', standardPath);

		case 'melt_operation':
			return resolveOperationPath(mintInfo, 'POST', standardPath, ['/melt', '/burn']);

		case 'melt_quote':
			return resolveQuotePath(mintInfo, 'melt', '5', standardPath);

		case 'swap':
			return resolveOperationPath(mintInfo, 'POST', standardPath, ['/swap']);

		case 'restore':
			return resolveOperationPath(mintInfo, 'POST', standardPath, ['/restore']);

		default:
			return standardPath;
	}
}

// ─── HTTP helpers ────────────────────────────────────────────

function normalizeMintUrl(mintUrl: string): string {
	// Remove trailing slash
	return mintUrl.replace(/\/+$/, '');
}

interface RequestOptions {
	method?: 'GET' | 'POST';
	body?: unknown;
	timeout?: number;
}

/** Transient HTTP statuses worth retrying (belt-and-suspenders vs intermittent 502). */
const TRANSIENT_5XX = new Set([502, 503, 504]);

/** Total attempts for transient failures: 1 initial + 2 retries. */
const MAX_ATTEMPTS = 3;

/** Exponential backoff base (ms) — doubles each retry: 250ms, 500ms. */
const RETRY_BACKOFF_BASE_MS = 250;

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFromMint<T>(
	mintUrl: string,
	path: string,
	options: RequestOptions = {}
): Promise<T> {
	// Direct fetch to the absolute mint URL. The mint sends
	// `Access-Control-Allow-Origin: *`, so no dev-server proxy is needed.
	const url = `${normalizeMintUrl(mintUrl)}${path}`;
	const { method = 'GET', body, timeout = 15000 } = options;

	const headers: Record<string, string> = {
		Accept: 'application/json'
	};

	let requestBody: string | undefined;

	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		requestBody = JSON.stringify(body);
	}

	let lastTransientError: CashuError | undefined;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				method,
				headers,
				body: requestBody,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				let errorDetail = '';
				let errorCode: number | string | undefined;
				try {
					const errorBody = (await response.json()) as Record<string, unknown>;
					errorDetail =
						(errorBody.detail as string) || (errorBody.error as string) || '';
					const code = errorBody.code;
					if (typeof code === 'number' || typeof code === 'string') {
						errorCode = code;
					}
				} catch {
					// ignore parse errors
				}
				const codeSuffix = errorCode !== undefined ? ` (${errorCode})` : '';
				const err = new CashuError(
					`HTTP ${response.status}${codeSuffix}: ${errorDetail || response.statusText}`,
					response.status,
					errorCode
				);

				// Retry transient 5xx (502/503/504) with exponential backoff,
				// unless this was the final attempt.
				if (TRANSIENT_5XX.has(response.status) && attempt < MAX_ATTEMPTS) {
					lastTransientError = err;
					await sleep(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1));
					continue;
				}

				throw err;
			}

			const data = await response.json();
			return data as T;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof CashuError) {
				throw error;
			}

			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new NetworkError(new Error(`Request timeout to ${url}`));
			}

			if (error instanceof TypeError) {
				throw new MintUnreachableError(mintUrl, error as Error);
			}

			throw new NetworkError(error as Error);
		}
	}

	// Unreachable: every path above either returns or throws.
	throw lastTransientError ?? new NetworkError(new Error(`Request failed to ${url}`));
}

// ─── Mint Info ───────────────────────────────────────────────

/**
 * GET /v1/info — get mint information and supported NUT versions
 */
export async function getMintInfo(mintUrl: string): Promise<MintInfo> {
	return fetchFromMint<MintInfo>(mintUrl, '/v1/info');
}

// ─── Keysets ─────────────────────────────────────────────────

/**
 * GET /v1/keys — get all available keysets with their keys.
 */
export async function getAllKeys(mintUrl: string): Promise<{ keysets: Array<{ id: string; unit: string; active: boolean; input_fee_ppk?: number; keys: Record<number, string> }> }> {
	const data = await fetchFromMint<{ keysets: Array<{ id: string; unit: string; active: boolean; input_fee_ppk?: number; keys: Record<number, string> }> }>(mintUrl, '/v1/keys');
	return data;
}

/**
 * GET /v1/keys — get available keysets with keys (legacy alias for getAllKeys).
 */
export async function getKeysets(mintUrl: string): Promise<MintKeyset[]> {
	const data = await fetchFromMint<MintKeys>(mintUrl, '/v1/keys');
	// The API returns { keysets: [...] }
	if (data && Array.isArray(data.keysets)) {
		// Check if array contains strings (keyset IDs) or objects
		if (data.keysets.length > 0 && typeof data.keysets[0] === 'string') {
			return (data.keysets as string[]).map((id: string) => ({
				id,
				unit: 'sat',
				active: true
			}));
		}
		return data.keysets as MintKeyset[];
	}
	return [];
}

// ─── Keys ────────────────────────────────────────────────────

/**
 * GET /v1/keys/{keysetId} — get keys for a specific keyset
 */
export async function getKeys(mintUrl: string, keysetId: string): Promise<Record<number, string>> {
	const data = await fetchFromMint<{ keysets: Array<{ id: string; keys: Record<number, string> }> }>(
		mintUrl,
		`/v1/keys/${encodeURIComponent(keysetId)}`
	);
	// The response may be { keysets: [...] } or directly { keys: {...} }
	if (data && Array.isArray(data.keysets)) {
		const ks = data.keysets.find(k => k.id === keysetId);
		if (ks && ks.keys) return ks.keys;
	}
	// Some mints return keys directly
	const directData = data as unknown as Record<string, unknown>;
	if (directData && typeof directData === 'object' && '1' in directData) {
		return directData as unknown as Record<number, string>;
	}
	return {};
}

// ─── Mint (Ecash) ────────────────────────────────────────────

/**
 * POST — request a mint quote (bolt11 or as declared by NUT-04).
 *
 * @param mintInfo Optional — when provided, the quote path is resolved from
 *   NUT-04 methods + NUT-19 cached_endpoints. Falls back to /v1/mint/quote/bolt11.
 */
export async function requestMintQuote(
	mintUrl: string,
	amount: number,
	mintInfo?: MintInfo
): Promise<MintQuote> {
	const path = resolveEndpointPath(mintInfo, 'mint_quote');
	// TASK-084: Nutshell/0.20.1 requires unit field
	return fetchFromMint<MintQuote>(mintUrl, path, {
		method: 'POST',
		body: { amount, unit: 'sat' }
	});
}

// ─── NUT-07: Proof State Check ─────────────────────────────

/**
 * POST /v1/checkstate — check the state of proofs with the mint.
 *
 * NUT-07: The mint returns the current state of each proof
 * (UNSPENT, PENDING, or SPENT), which the wallet should verify
 * before attempting to melt/spend.
 *
 * @param mintUrl - The Cashu mint URL
 * @param proofs - Array of proofs to check (at minimum: secret + C)
 * @returns CheckStateResponse with state for each proof
 */
export async function checkState(
	mintUrl: string,
	proofs: CheckStateProof[]
): Promise<CheckStateResponse> {
	const path = STANDARD_PATHS.check_state;
	// F-086: NUT-07 expects Y = hash_to_curve(secret), not C (commitment).
	// TASK-241: the proof `secret` is a hex string (64 chars); blind.ts derives
	// Y from the UTF-8 bytes of that string (see blindMessage), so checkState
	// must do the same — NOT hex-decode it. Otherwise the mint can't match the
	// proof by Y and always reports UNSPENT (RC-4 double-spend detection broken).
	const Ys = proofs.map(p => hash_to_curve(utf8ToBytes(p.secret)).toHex(true));
	try {
		return await fetchFromMint<CheckStateResponse>(mintUrl, path, {
			method: 'POST',
			body: { Ys }
		});
	} catch (e) {
		// Fallback: if mint rejects Y-based format (400), retry with C
		if (e instanceof CashuError && e.status === 400) {
			return fetchFromMint<CheckStateResponse>(mintUrl, path, {
				method: 'POST',
				body: { Ys: proofs.map(p => p.C!) }
			});
		}
		throw e;
	}
}

/**
 * NUT-09: Request the mint to re-issue previously-issued blind signatures.
 *
 * Used for wallet recovery (NUT-13): the wallet regenerates the same
 * `BlindedMessages` from its seed and asks the mint to return the
 * `BlindSignatures` it originally issued for those blinded messages.
 *
 * @param mintUrl - The Cashu mint URL
 * @param outputs - Regenerated blinded outputs ({ amount, id, B_ })
 * @param mintInfo - Optional; resolves the path via NUT-19 cached_endpoints
 * @returns { outputs, signatures } — signatures aligned 1:1 with outputs
 */
export async function restoreOutputs(
	mintUrl: string,
	outputs: RestoreBlindedMessage[],
	mintInfo?: MintInfo
): Promise<PostRestoreResponse> {
	const path = resolveEndpointPath(mintInfo, 'restore');
	return fetchFromMint<PostRestoreResponse>(mintUrl, path, {
		method: 'POST',
		body: { outputs }
	});
}

/**
 * POST — mint tokens (submit outputs for blind signatures).
 *
 * @param mintInfo Optional — when provided, the operation path is resolved from
 *   NUT-19 cached_endpoints. Falls back to /v1/mint/bolt11.
 */
export async function mintTokens(
	mintUrl: string,
	quoteId: string,
	outputs: unknown[],
	mintInfo?: MintInfo
): Promise<PostMintResponse> {
	const path = resolveEndpointPath(mintInfo, 'mint_operation');
	return fetchFromMint<PostMintResponse>(mintUrl, path, {
		method: 'POST',
		body: { quote: quoteId, outputs }
	});
}

// ─── Quote Status Check ─────────────────────────────────────

/**
 * TASK-084: Check the status of a mint quote.
 * GET /v1/mint/quote/bolt11/<quote_id>
 *
 * Returns the quote with its current state (UNPAID, PAID, EXPIRED, ISSUED).
 * The caller should poll this until state === 'PAID' before calling mintTokens.
 */
export async function checkMintQuote(
	mintUrl: string,
	quoteId: string,
): Promise<MintQuote> {
	const path = `${STANDARD_PATHS.mint_quote_check}/${encodeURIComponent(quoteId)}`;
	return fetchFromMint<MintQuote>(mintUrl, path, { method: 'GET' });
}

/**
 * TASK-084: Check the status of a melt quote.
 * GET /v1/melt/quote/bolt11/<quote_id>
 *
 * Returns the quote with its current state.
 */
export async function checkMeltQuote(
	mintUrl: string,
	quoteId: string,
): Promise<MeltQuote> {
	const path = `${STANDARD_PATHS.melt_quote_check}/${encodeURIComponent(quoteId)}`;
	return fetchFromMint<MeltQuote>(mintUrl, path, { method: 'GET' });
}

/**
 * TASK-084: Poll a mint quote until it reaches a target state.
 * Uses exponential backoff with configurable retries/timeout.
 *
 * @param mintUrl - The Cashu mint URL
 * @param quoteId - The quote ID to poll
 * @param targetState - State to wait for (default: 'PAID')
 * @param maxWaitMs - Maximum total wait time in ms (default: 120000 = 2 min)
 * @param pollIntervalMs - Initial poll interval in ms (default: 2000)
 * @returns The quote once it reaches target state
 * @throws Error if quote expires or times out
 */
export async function pollMintQuoteUntil(
	mintUrl: string,
	quoteId: string,
	targetState: string = 'PAID',
	maxWaitMs: number = 120_000,
	pollIntervalMs: number = 2_000,
): Promise<MintQuote> {
	const startTime = Date.now();
	let interval = pollIntervalMs;

	while (Date.now() - startTime < maxWaitMs) {
		const quote = await checkMintQuote(mintUrl, quoteId);
		const state = quote.state ?? 'UNPAID';

		if (state === targetState) {
			return quote;
		}

		if (state === 'EXPIRED') {
			throw new Error(`Mint quote ${quoteId} has expired`);
		}

		// Exponential backoff: double the interval up to 30s
		await new Promise(resolve => setTimeout(resolve, interval));
		interval = Math.min(interval * 1.5, 30_000);
	}

	throw new Error(`Mint quote ${quoteId} did not reach state "${targetState}" within ${maxWaitMs}ms`);
}

// ─── Melt (Spend) ────────────────────────────────────────────

/**
 * POST — request a melt quote (bolt11 or as declared by NUT-05).
 *
 * @param mintInfo Optional — when provided, the quote path is resolved from
 *   NUT-05 methods + NUT-19 cached_endpoints. Falls back to /v1/melt/quote/bolt11.
 */
export async function requestMeltQuote(
	mintUrl: string,
	invoice: string,
	amount?: number,
	mintInfo?: MintInfo
): Promise<MeltQuote> {
	const body: Record<string, unknown> = { request: invoice, unit: 'sat' };
	if (amount !== undefined) body.amount = amount;
	const path = resolveEndpointPath(mintInfo, 'melt_quote');
	return fetchFromMint<MeltQuote>(mintUrl, path, {
		method: 'POST',
		body
	});
}

/**
 * POST — melt tokens (spend proofs, get change).
 *
 * @param mintInfo Optional — when provided, the operation path is resolved from
 *   NUT-19 cached_endpoints. Falls back to /v1/melt/bolt11.
 */
export async function meltTokens(
	mintUrl: string,
	quoteId: string,
	inputs: unknown[],
	outputs?: unknown[],
	mintInfo?: MintInfo
): Promise<PostMeltResponse> {
	const body: Record<string, unknown> = { quote: quoteId, inputs };
	if (outputs && outputs.length > 0) body.outputs = outputs;
	const path = resolveEndpointPath(mintInfo, 'melt_operation');
	return fetchFromMint<PostMeltResponse>(mintUrl, path, {
		method: 'POST',
		body
	});
}

/**
 * NUT-03: Swap proofs for new ones (double-spend protection on receive).
 * Sends old proofs to /v1/swap and receives new (unspent) proofs.
 */
export async function swapProofs(
	mintUrl: string,
	proofs: Array<{ secret: string; C: string; amount: number; id: string }>,
	outputs?: Array<{ amount: number; id: string; B_: string }>
): Promise<{
	signatures: Array<{ id: string; amount: number; C_: string; dleq?: { e: string; s: string } }>;
}> {
	// Defense-in-depth (F262-R4): validate each input proof's signature (C)
	// before sending. C is the unblinded BDHKE signature — a compressed
	// secp256k1 point serialized as 33 bytes / 66 hex chars (`02`/`03` prefix).
	// A malformed C would otherwise reach the mint and fail late (or corrupt
	// the swap), so reject it locally first.
	const SIG_POINT_HEX_RE = /^0[23][0-9a-fA-F]{64}$/;
	for (const p of proofs) {
		if (typeof p.C !== 'string' || !SIG_POINT_HEX_RE.test(p.C)) {
			throw new Error(
				'Invalid proof signature (C): expected a 66-char hex-encoded compressed ' +
					'secp256k1 point with a 02/03 prefix'
			);
		}
	}

	const inputs = proofs.map(p => ({ secret: p.secret, C: p.C, amount: p.amount, id: p.id }));
	const body: Record<string, unknown> = { inputs };
	if (outputs && outputs.length > 0) {
		body.outputs = outputs;
	}
	const path = STANDARD_PATHS.swap;
	const response = await fetchFromMint<{
		signatures?: Array<{ id: string; amount: number; C_: string; dleq?: { e: string; s: string } }>;
	}>(mintUrl, path, {
		method: 'POST',
		body
	});

	if (!response.signatures || !Array.isArray(response.signatures)) {
		throw new CashuError('Invalid swap response', 500);
	}

	return { signatures: response.signatures };
}
