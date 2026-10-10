/**
 * TASK-1403 (F-049-002 / OI-v5-4 ทาง (1)) — migration one-time boot sweep.
 *
 * WHAT THIS PROVES (dispatch must_do 5, acceptance 4-part):
 *   ทิศ 1 (fixup): legacy 'confirmed' cashu_receive WITHOUT proofIds whose
 *     proofs are STILL pending_normalize → flipped back to 'pending' +
 *     proofIds mapping attached (the flush settle path owns it from here).
 *   ทิศ 2 (untouched): genuinely-settled 'confirmed' (no pending proof
 *     matches) + already-mapped records → UNTOUCHED (ห้ามแตะ record
 *     confirmed จริง; mapping owned by the flush, not the migration).
 *   one-time: second run is a no-op (ran:false).
 *   rollback: flips back ONLY the touched txs pending→confirmed + clears
 *     the flag so a re-run re-fixes.
 *
 * Record-level only: storage/db + proofsDb (fake-indexeddb) + txMigration.
 * No .svelte, no proof rows touched, no online path, no client.ts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	runTxPendingMigrationOnce,
	rollbackTxPendingMigration,
	TX_PENDING_MIGRATION_FLAG
} from '../txMigration';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	markPendingNormalizeByProof,
	clearPendingNormalize,
	makeLocalId
} from '../proofsDb';
import {
	addTransaction,
	getTransactionById,
	getTransactions,
	deleteDatabase
} from '../../storage/db';
import type { TokenProof } from '../../types';

const MINT_URL = 'https://mint.mig1403.test';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';

function proof(amount: number, label: string): TokenProof {
	return { id: KEYSET_ID, amount, secret: `mig-${label}`, C: `sig-mig-${label}` };
}

/** Legacy stale-confirmed tx (no proofIds) + still-pending proofs. */
async function seedStaleConfirmed(txId: string, labels: string[], txTime = Date.now()): Promise<string[]> {
	const proofs = labels.map((label, i) => proof(i + 1, label));
	await addProofs(proofs, MINT_URL, KEYSET_ID);
	await markPendingNormalizeByProof(proofs);
	await addTransaction({
		id: txId,
		type: 'cashu_receive',
		protocol: 'cashu',
		amount: proofs.reduce((s, p) => s + p.amount, 0),
		mint_url: MINT_URL,
		timestamp: txTime,
		token_hash: `tok-${txId}`,
		status: 'confirmed',
		fee: 0
		// NO proofIds — legacy v4.4/v4.5 shape
	});
	return proofs.map((p) => makeLocalId(p));
}

describe('TASK-1403 — OI-v5-4 ทิศ 1: stale-confirmed + proofs pending → fixup pending + mapping', () => {
	it('legacy confirmed with pending proofs → pending + proofIds attached', async () => {
		const ids = await seedStaleConfirmed('tx-stale', ['a', 'b']);

		const res = await runTxPendingMigrationOnce();
		expect(res.ran).toBe(true);
		expect(res.fixed).toContain('tx-stale');

		const tx = (await getTransactionById('tx-stale'))!;
		expect(tx.status).toBe('pending');
		expect([...(tx.proofIds ?? [])].sort()).toEqual([...ids].sort());
	});

	it('flag set after run — second run is a no-op (one-time)', async () => {
		await seedStaleConfirmed('tx-once', ['c']);
		const first = await runTxPendingMigrationOnce();
		expect(first.ran).toBe(true);
		expect(localStorage.getItem(TX_PENDING_MIGRATION_FLAG)).not.toBeNull();

		const second = await runTxPendingMigrationOnce();
		expect(second.ran).toBe(false);
		expect(second.fixed).toHaveLength(0);
	});
});

describe('TASK-1403 — OI-v5-4 ทิศ 2: truly-settled + mapped → untouched', () => {
	it('confirmed with NO pending proof match (genuinely confirmed online receive) → untouched', async () => {
		await seedStaleConfirmed('tx-real', ['d']);
		// Settle the proofs the way a real online/swap life would — then the
		// record is genuinely confirmed and the sweep must not touch it.
		const all = (await import('../proofsDb')).getAllProofs;
		const rows = await all();
		await clearPendingNormalize(rows.map((p) => p.local_id));

		localStorage.removeItem(TX_PENDING_MIGRATION_FLAG);
		const res = await runTxPendingMigrationOnce();
		expect(res.ran).toBe(true);
		expect(res.fixed).not.toContain('tx-real');
		expect(res.untouched).toContain('tx-real');
		expect((await getTransactionById('tx-real'))!.status).toBe('confirmed');
	});

	it('confirmed WITH a mapping → untouched (flush settle path owns it)', async () => {
		const proofs = [proof(2, 'e')];
		await addProofs(proofs, MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(proofs);
		await addTransaction({
			id: 'tx-mapped',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 2,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-mapped',
			status: 'confirmed',
			fee: 0,
			proofIds: proofs.map((p) => makeLocalId(p))
		});

		localStorage.removeItem(TX_PENDING_MIGRATION_FLAG);
		const res = await runTxPendingMigrationOnce();
		expect(res.untouched).toContain('tx-mapped');
		expect(res.fixed).not.toContain('tx-mapped');
		expect((await getTransactionById('tx-mapped'))!.proofIds).toHaveLength(1);
	});
});

describe('TASK-1403 — OI-v5-4 rollback: only touched txs flip back + flag cleared', () => {
	it('rollback flips ONLY the sweep-touched txs back to confirmed', async () => {
		await seedStaleConfirmed('tx-rb-fix', ['f']);
		// a genuinely-confirmed record the sweep must never touch
		await addTransaction({
			id: 'tx-rb-keep',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 1,
			mint_url: 'https://other-mint.example',
			timestamp: Date.now(),
			token_hash: 'tok-keep',
			status: 'confirmed',
			fee: 0
		});

		const sweep = await runTxPendingMigrationOnce();
		expect(sweep.fixed).toContain('tx-rb-fix');
		expect((await getTransactionById('tx-rb-fix'))!.status).toBe('pending');

		const rolled = await rollbackTxPendingMigration();
		expect(rolled).toContain('tx-rb-fix');
		expect(rolled).not.toContain('tx-rb-keep');
		expect((await getTransactionById('tx-rb-fix'))!.status).toBe('confirmed');
		expect((await getTransactionById('tx-rb-keep'))!.status).toBe('confirmed');
		// flag cleared → a re-run sees the mapping rollback KEPT (flush settle
		// path owns it now) → untouched, never re-fixed (strict: mapped txs
		// belong to the flush, not the migration).
		expect(localStorage.getItem(TX_PENDING_MIGRATION_FLAG)).toBeNull();
		const rerun = await runTxPendingMigrationOnce();
		expect(rerun.ran).toBe(true);
		expect(rerun.fixed).not.toContain('tx-rb-fix');
		expect(rerun.untouched).toContain('tx-rb-fix');
		expect((await getTransactionById('tx-rb-fix'))!.proofIds?.length).toBeGreaterThan(0);
	});
});

beforeEach(async () => {
	localStorage.removeItem(TX_PENDING_MIGRATION_FLAG);
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();
});

afterEach(async () => {
	localStorage.removeItem(TX_PENDING_MIGRATION_FLAG);
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();
	// prove no cross-test residue: the flag is gone and tx table is empty
	expect(await getTransactions().catch(() => [])).toHaveLength(0);
});
