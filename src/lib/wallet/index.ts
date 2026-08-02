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
export * from './tokenStore';

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
	type StoredProof
} from './proofsDb';

export {
	getEncryptedKey,
	setEncryptedKey,
	clearEncryptedKey,
	getPinHash as getWalletPinHash,
	setWalletState,
	getWalletState as getStoredWalletState,
	clearAllWalletData,
	type WalletStateEnum
} from './storage';
