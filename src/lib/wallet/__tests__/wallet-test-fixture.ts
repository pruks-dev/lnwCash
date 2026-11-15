/**
 * INTENT-054 rev53 (TASK-5473) — shared LIGHT wallet test fixture.
 *
 * TEST-ONLY helper. No product code is modified by this file; it only calls
 * the same public test-surface functions every wallet test already calls
 * (`clearAllWalletData`, `resetProofDB`), minus one redundancy:
 *
 *   `clearAllWalletData()` (src/lib/wallet/storage.ts) ALREADY calls
 *   `deleteProofDB()` internally (storage.ts ~L249-250). The historical
 *   hook pattern
 *
 *     await clearAllWalletData();
 *     await deleteProofDB();      // ← redundant 2nd deleteDB round-trip
 *     resetProofDB();
 *
 *   therefore schedules TWO `indexedDB.deleteDatabase` trips per hook through
 *   fake-indexeddb's event queue. Under full-suite parallel load (sibling
 *   files doing real DLEQ/Carol-chain crypto) the 2nd trip is pure scheduling
 *   contention — the r52 flake signature (Hook timed out 10000/30000ms, ZERO
 *   product assertion failures).
 *
 *   This helper keeps the EXACT same end-state (storages wiped, proofs DB
 *   deleted, in-memory handles nulled) with ONE deleteDB trip per call.
 *   Going-forward standard: new wallet tests use this instead of the
 *   triple-call; global/project timeout policy in vite.config.ts `test:`
 *   block carries the scheduling headroom (no more per-file `vi.setConfig`
 *   bumps — rev52 hunks reverted).
 */
import { clearAllWalletData } from '../storage';
import { resetProofDB } from '../proofsDb';

/**
 * Light reset: wipe wallet storages (localStorage + proofs DB via the single
 * internal `deleteProofDB()` inside `clearAllWalletData`) and null stale
 * in-memory DB handles. Semantics-preserving replacement for the
 * `clearAllWalletData + deleteProofDB + resetProofDB` triple-call.
 */
export async function resetWalletFixtureLight(): Promise<void> {
	await clearAllWalletData();
	resetProofDB();
}
