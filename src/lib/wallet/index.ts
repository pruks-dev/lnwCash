/**
 * Wallet module barrel export.
 * All wallet logic is client-side only.
 */
export * from './keys';
export * from './state';
export * from './seed';
export * from './balance';
export * from './mint';
export * from './melt';
export * from './transfer';
export * from './offline';
export * from './errors';
export * from './config';
export * from './discovery';
export * from './store';
export {
	storeTokens,
	getProofBalance,
	validateProofs,
	findSpentProof,
	type TokenStateCheck,
	type ProofBalance
} from './tokenStore';

// TASK-1304 (INTENT-013): auto-normalize wiring (T1/T2/T3 + bound swap)
// TASK-1402: runFlushDrain (dual-rail drain) + drain introspection.
export {
	isWalletOnline,
	boundSwapFn,
	createAutoNormalizeDeps,
	scheduleNormalizeAfterReceiveOnline,
	scheduleNormalizeAfterMint,
	flushPendingNormalizeOnBackOnline,
	runFlushDrain,
	isFlushDrainInFlight,
	resetFlushDrainForTests,
	normalizePileNow,
	cancelScheduledNormalize
} from './normalizeWiring';

// proofs and proofsDb have overlapping names, export selectively:
export { selectProofs, sumProofs, groupByKeyset, groupByMint } from './proofs';
export {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	deleteProofDB,
	resetProofDB,
	getTotalBalance,
	getBalanceByMint as getTotalBalanceBreakdown,
	getProofCount,
	clearProofs,
	retagProofs,
	getOrphanedProofs,
	clearOrphaned,
	needsRetagging,
	updateProofMintUrl,
	markOrphaned,
	type StoredProof,
	type KnownMintInfo,
	type RetaggingResult
} from './proofsDb';

export {
	getEncryptedKey,
	setEncryptedKey,
	clearEncryptedKey,
	getEncryptedMnemonic,
	setEncryptedMnemonic,
	clearEncryptedMnemonic,
	getPinHash as getWalletPinHash,
	setWalletState,
	getWalletState as getStoredWalletState,
	clearAllWalletData,
	type WalletStateEnum
} from './storage';
