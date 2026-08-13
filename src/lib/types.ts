/**
 * Core type definitions for LNWCASH wallet
 */

// ─── Storage Types ───────────────────────────────────────────

/** @deprecated Use `cashu_send` or `cashu_receive` instead of `transfer` */
export type TransactionType = 'mint' | 'melt' | 'transfer' | 'cashu_send' | 'cashu_receive';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type TransactionProtocol = 'lightning' | 'cashu';

export interface Transaction {
	id: string;
	type: TransactionType;
	amount: number;
	mint_url: string;
	timestamp: number;
	token_hash: string | null;
	invoice?: string | null;
	preimage?: string | null;  // Lightning payment preimage (melt only)
	status: TransactionStatus;
	protocol?: TransactionProtocol;
	fee?: number;  // sats fee paid (mint melt only; cashu = 0)
}

export interface TransactionFilter {
	type?: TransactionType | TransactionType[];
	mint_url?: string;
	status?: TransactionStatus;
}

// ─── Wallet Metadata ─────────────────────────────────────────

export interface WalletMetadata {
	name: string;
	created_at: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface WalletSettings {
	language: string;
	theme: ThemeMode;
	default_mint: string;
	/** TASK-220: shuffle PIN keypad button positions (default off per Commander). */
	pin_shuffle: boolean;
}

export interface KeysetCacheEntry {
	id: string;
	unit: string;
	active: boolean;
	input_fee_ppk: number;
	keys: Record<number, string>;
	last_updated: number;
}

// ─── Crypto Types ────────────────────────────────────────────

export interface PinHash {
	salt: string;
	hash: string;
	iterations: number;
}

export interface EncryptedKey {
	salt: string;       // PBKDF2 salt
	iv: string;         // AES-GCM IV
	iterations: number; // PBKDF2 iterations
	data: string;       // encrypted private key
}

// ─── Cashu Mint API Types ────────────────────────────────────

/** NUT-19: A cached/static endpoint advertised by the mint */
export interface CachedEndpoint {
	method: string;   // HTTP method e.g. "POST", "GET"
	path: string;     // endpoint path e.g. "/v1/mint/bolt11"
}

/** NUT-04 / NUT-05: a single payment method (e.g. bolt11) */
export interface NutMethod {
	method: string;
	unit: string;
	options?: Record<string, unknown>;
}

/** NUT-04 mint settings */
export interface Nut4Settings {
	methods?: NutMethod[];
	disabled?: boolean;
}

/** NUT-05 melt settings */
export interface Nut5Settings {
	methods?: NutMethod[];
	disabled?: boolean;
}

/** NUT-19: cached endpoint discovery (ttl + cached_endpoints) */
export interface Nut19Settings {
	ttl?: number;
	cached_endpoints?: CachedEndpoint[];
}

/**
 * Shape of each entry inside the `nuts` record.
 * Union representing known NUT settings shapes + wildcard fallback.
 */
export type NutSettings =
	| { supported: boolean }
	| Nut4Settings
	| Nut5Settings
	| Nut19Settings
	| { methods: NutMethod[]; disabled?: boolean }
	| { supported: Array<{ method: string; unit: string; commands?: string[] }> }  // NUT-17
	| Record<string, unknown>;

export interface MintInfo {
	name: string;
	pubkey: string;
	version: string;
	description?: string;
	description_long?: string;
	contact?: MintContact[];
	motd?: string;
	icon_url?: string;
	urls?: string[];
	time?: number;
	tos_url?: string;
	nuts?: Record<string, NutSettings>;
}

export interface MintContact {
	method: string;
	info: string;
}

export interface MintKeyset {
	id: string;
	unit: string;
	active: boolean;
	input_fee_ppk?: number;
}

export interface MintKeys {
	keysets: MintKeyset[] | string[];
}

export interface MintQuoteRequest {
	amount: number;
}

export interface Bolt11MintQuoteRequest {
	quote: string;
	outputs: unknown[];
}

export interface Bolt11MeltQuoteRequest {
	request: string;
	amount?: number;
	unit?: string;
}

export interface MintQuote {
	quote: string;
	request: string;
	paid: boolean;
	expiry: number;
	state?: string;
}

export interface MeltQuote {
	quote: string;
	amount: number;
	fee_reserve: number;
	paid: boolean;
	expiry: number;
	state?: string;
}

export interface PostMintResponse {
	signatures: Array<{
		id: string;
		amount: number;
		C_: string; // blind signature
		dleq?: DleqProof;
	}>;
}

export interface PostMeltResponse {
	paid: boolean;
	payment_preimage?: string;
	change?: Array<{
		id: string;
		amount: number;
		C_: string;
		dleq?: DleqProof;
	}>;
}

// ─── NUT-07: Proof State Check ──────────────────────────────

export interface CheckStateProof {
	secret: string;
	C?: string;
}

export interface ProofState {
	secret: string;
	state: 'UNSPENT' | 'PENDING' | 'SPENT';
	witness?: string | null;
}

export interface CheckStateResponse {
	states: ProofState[];
}

// ─── Cashu Token Types ───────────────────────────────────────

export interface DleqProof {
	e: string;  // challenge (hex)
	s: string;  // response (hex)
	r?: string; // commitment (hex, computed after unblinding)
}

export interface TokenProof {
	id: string;
	amount: number;
	secret: string;
	C: string;
	dleq?: DleqProof;
	script?: {
		type: string;
		key?: string;
		sig?: string;
	};
}

export interface CashuToken {
	token: Array<{
		mint: string;
		proofs: TokenProof[];
	}>;
	unit?: string;
	memo?: string;
}

export interface DecodedToken {
	proofs: TokenProof[];
	mint: string;
	unit: string;
}
