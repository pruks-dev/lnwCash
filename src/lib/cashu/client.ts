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

// ─── Error types ─────────────────────────────────────────────

export class CashuError extends Error {
	constructor(
		message: string,
		public status?: number,
		public code?: number
	) {
		super(message);
		this.name = 'CashuError';
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
	operationKey: 'mint_operation' | 'mint_quote' | 'melt_operation' | 'melt_quote' | 'swap'
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

async function fetchFromMint<T>(
	mintUrl: string,
	path: string,
	options: RequestOptions = {}
): Promise<T> {
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
			try {
				const errorBody = await response.json();
				errorDetail = (errorBody as Record<string, unknown>).detail as string ||
					(errorBody as Record<string, unknown>).error as string || '';
			} catch {
				// ignore parse errors
			}
			throw new CashuError(
				`HTTP ${response.status}: ${errorDetail || response.statusText}`,
				response.status
			);
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

// ─── Mint Info ───────────────────────────────────────────────

/**
 * GET /v1/info — get mint information and supported NUT versions
 */
export async function getMintInfo(mintUrl: string): Promise<MintInfo> {
	return fetchFromMint<MintInfo>(mintUrl, '/v1/info');
}

// ─── Keysets ─────────────────────────────────────────────────

/**
 * GET /v1/keys — get available keysets with keys
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
	return fetchFromMint<CheckStateResponse>(mintUrl, path, {
		method: 'POST',
		body: { Ys: proofs.map(p => p.C!) }
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
