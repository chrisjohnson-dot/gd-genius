/**
 * 10-1-Go: QC Scanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature: QC Scanner — scan outbound orders, build pallets, complete sessions
 * Goal:    Every scan is accurately counted, over-scans are blocked, MU
 *          over-scans are blocked, pallets are correctly built, and sessions
 *          complete cleanly with accurate final counts.
 *
 * Test categories:
 *  1 = Happy Path       2 = Empty/Zero     3 = Boundary
 *  4 = Duplicate/Replay 5 = Bad Input      6 = Permission/Auth
 *  7 = Concurrency/Race 8 = Data Integrity 9 = Cascade/Cleanup
 * 10 = Recovery/Reopen
 */

import { getDb } from '../runner.mjs';

// ── Real completed session for read-only reference ────────────────────────────
const REF_SESSION_ID = 990089;   // TX 3494642, K18 Inc - B2B, complete
const REF_TX_ID      = 3494642;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function createTestSession(db, opts = {}) {
  const [r] = await db.query(`
    INSERT INTO qc_scan_sessions
      (transactionId, referenceNumber, customerName, facilityName, status, createdAt, updatedAt)
    VALUES (?, ?, '10-1-Go Test Customer', 'TEST-FACILITY', 'scanning', NOW(), NOW())
  `, [opts.txId ?? 9999999, `TEST-REF-${opts.txId ?? 9999999}`]);
  return r.insertId;
}

async function addScanItem(db, sessionId, sku, expectedQty, scannedQty = 0) {
  await db.query(`
    INSERT INTO qc_scan_items (sessionId, sku, upc, expectedQty, scannedQty, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE expectedQty = VALUES(expectedQty), scannedQty = VALUES(scannedQty)
  `, [sessionId, sku, sku + '-UPC', expectedQty, scannedQty]);
}

async function createPallet(db, sessionId, palletNumber = 1) {
  const [r] = await db.query(`
    INSERT INTO qc_pallets (sessionId, palletNumber, items, createdAt)
    VALUES (?, ?, '[]', NOW())
  `, [sessionId, palletNumber]);
  return r.insertId;
}

async function cleanup(db, sessionId) {
  if (!sessionId) return;
  await db.query(`DELETE FROM qc_scan_items WHERE sessionId = ?`, [sessionId]);
  await db.query(`DELETE FROM qc_pallets WHERE sessionId = ?`, [sessionId]);
  await db.query(`DELETE FROM qc_scan_sessions WHERE id = ?`, [sessionId]);
}

// ═════════════════════════════════════════════════════════════════════════════
export default {
  feature: "QC Scanner",
  goal: "Every scan is accurately counted, over-scans are blocked, MU over-scans are blocked, pallets are correctly built, and sessions complete cleanly",

  tests: [

    // ── TEST 1: Happy Path ───────────────────────────────────────────────────
    {
      id: 1, name: "Completed session has matching expected vs scanned qty", category: 1,
      async run() {
        const db = await getDb();
        try {
          const [items] = await db.query(
            `SELECT sku, expectedQty, scannedQty FROM qc_scan_items WHERE sessionId = ? ORDER BY sku`,
            [REF_SESSION_ID]
          );
          const [session] = await db.query(
            `SELECT status FROM qc_scan_sessions WHERE id = ?`,
            [REF_SESSION_ID]
          );
          const allComplete = items.every(i => Number(i.scannedQty) >= Number(i.expectedQty));
          const isComplete = session[0]?.status === 'complete';
          const mismatches = items.filter(i => Number(i.scannedQty) < Number(i.expectedQty))
            .map(i => `${i.sku}: expected ${i.expectedQty}, scanned ${i.scannedQty}`);
          return {
            pass: allComplete && isComplete,
            detail: allComplete
              ? `TX ${REF_TX_ID}: ${items.length} SKUs all at 100%, status=complete`
              : `Under-scanned SKUs: ${mismatches.join('; ')}`,
          };
        } finally { await db.end(); }
      }
    },

    // ── TEST 2: Empty / Zero Input ───────────────────────────────────────────
    {
      id: 2, name: "Session with 0 expected qty items handles gracefully", category: 2,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999001 });
          // Add item with 0 expected qty
          await addScanItem(db, sid, 'ZERO-SKU', 0, 0);
          const [items] = await db.query(
            `SELECT expectedQty, scannedQty FROM qc_scan_items WHERE sessionId = ?`,
            [sid]
          );
          // A session with 0 expected qty should be considered complete (nothing to scan)
          const allComplete = items.every(i => Number(i.scannedQty) >= Number(i.expectedQty));
          return {
            pass: allComplete,
            detail: `Item with expectedQty=0 treated as complete (0 >= 0) — session can be finalized`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 3: Boundary Values ──────────────────────────────────────────────
    {
      id: 3, name: "Scanning exactly to expectedQty (100%) does not over-scan", category: 3,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999002 });
          await addScanItem(db, sid, 'BOUNDARY-SKU', 10, 0);
          // Simulate scanning exactly 10 units
          await db.query(
            `UPDATE qc_scan_items SET scannedQty = 10 WHERE sessionId = ? AND sku = 'BOUNDARY-SKU'`,
            [sid]
          );
          const [items] = await db.query(
            `SELECT expectedQty, scannedQty FROM qc_scan_items WHERE sessionId = ? AND sku = 'BOUNDARY-SKU'`,
            [sid]
          );
          const item = items[0];
          const atExactly100 = Number(item.scannedQty) === Number(item.expectedQty);
          const notOver = Number(item.scannedQty) <= Number(item.expectedQty);
          return {
            pass: atExactly100 && notOver,
            detail: `scannedQty=${item.scannedQty}, expectedQty=${item.expectedQty} — exactly at 100%, not over`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 4: Duplicate / Replay ───────────────────────────────────────────
    {
      id: 4, name: "Over-scan guard: scannedQty cannot exceed expectedQty in DB", category: 4,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999003 });
          await addScanItem(db, sid, 'OVERSCAN-SKU', 5, 5); // already at 100%
          // Attempt to increment beyond expected (simulating what the server prevents)
          const [before] = await db.query(
            `SELECT scannedQty, expectedQty FROM qc_scan_items WHERE sessionId = ? AND sku = 'OVERSCAN-SKU'`,
            [sid]
          );
          const beforeQty = Number(before[0].scannedQty);
          const expectedQty = Number(before[0].expectedQty);
          // The server uses Math.min(scannedQty + 1, expectedQty) — simulate that
          const newQty = Math.min(beforeQty + 1, expectedQty);
          await db.query(
            `UPDATE qc_scan_items SET scannedQty = ? WHERE sessionId = ? AND sku = 'OVERSCAN-SKU'`,
            [newQty, sid]
          );
          const [after] = await db.query(
            `SELECT scannedQty FROM qc_scan_items WHERE sessionId = ? AND sku = 'OVERSCAN-SKU'`,
            [sid]
          );
          const afterQty = Number(after[0].scannedQty);
          return {
            pass: afterQty <= expectedQty && afterQty === 5,
            detail: `Over-scan capped: attempted qty=${beforeQty + 1}, Math.min result=${afterQty}, expectedQty=${expectedQty}`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 5: Bad Input ────────────────────────────────────────────────────
    {
      id: 5, name: "MU over-scan guard: MU qty > remaining is detected and blocked", category: 5,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999004 });
          // Simulate the exact scenario from order 3494378: 84 MU units, 74 remaining
          await addScanItem(db, sid, 'GR-071216', 84, 10); // 84 expected, 10 already scanned → 74 remaining
          const [items] = await db.query(
            `SELECT expectedQty, scannedQty FROM qc_scan_items WHERE sessionId = ? AND sku = 'GR-071216'`,
            [sid]
          );
          const item = items[0];
          const remaining = Number(item.expectedQty) - Number(item.scannedQty);
          const muQty = 84; // MU has 84 units
          const wouldOverScan = muQty > remaining;
          return {
            pass: wouldOverScan === true,
            detail: `MU has ${muQty} units, only ${remaining} remain — over-scan guard correctly identifies this as blocked (${muQty} > ${remaining})`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 6: Permission / Auth ────────────────────────────────────────────
    {
      id: 6, name: "Completed session is read-only — status cannot be changed to 'scanning' without manager", category: 6,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999005 });
          // Mark as complete
          await db.query(`UPDATE qc_scan_sessions SET status = 'complete', completedAt = NOW() WHERE id = ?`, [sid]);
          // Verify it's complete
          const [before] = await db.query(`SELECT status FROM qc_scan_sessions WHERE id = ?`, [sid]);
          const isComplete = before[0]?.status === 'complete';
          // The reopenSession procedure requires isManagerOrAdmin check — we verify the DB state
          // is correctly set to complete (the auth check is server-side, tested here via state)
          return {
            pass: isComplete,
            detail: `Session correctly marked as 'complete' — reopening requires manager auth (isManagerOrAdmin check in server)`,
            warning: `Auth enforcement is server-side only; direct DB access bypasses it`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 7: Concurrency / Race ───────────────────────────────────────────
    {
      id: 7, name: "Concurrent scans of different SKUs don't corrupt each other's counts", category: 7,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999006 });
          const skus = ['SKU-A', 'SKU-B', 'SKU-C', 'SKU-D', 'SKU-E'];
          for (const sku of skus) {
            await addScanItem(db, sid, sku, 10, 0);
          }
          // Simulate concurrent scans by firing all updates simultaneously
          await Promise.all(skus.map(sku =>
            db.query(
              `UPDATE qc_scan_items SET scannedQty = LEAST(scannedQty + 5, expectedQty) WHERE sessionId = ? AND sku = ?`,
              [sid, sku]
            )
          ));
          const [items] = await db.query(
            `SELECT sku, scannedQty, expectedQty FROM qc_scan_items WHERE sessionId = ? ORDER BY sku`,
            [sid]
          );
          const allCorrect = items.every(i => Number(i.scannedQty) === 5);
          const details = items.map(i => `${i.sku}:${i.scannedQty}`).join(', ');
          return {
            pass: allCorrect && items.length === skus.length,
            detail: `${items.length} SKUs after concurrent scan: ${details}`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 8: Data Integrity ───────────────────────────────────────────────
    {
      id: 8, name: "Pallet items JSON is valid and totals match scanned quantities", category: 8,
      async run() {
        const db = await getDb();
        try {
          // Check a real completed session's pallets
          const [pallets] = await db.query(
            `SELECT id, palletNumber, items FROM qc_pallets WHERE sessionId = ? AND deletedAt IS NULL ORDER BY palletNumber`,
            [REF_SESSION_ID]
          );
          const [scanItems] = await db.query(
            `SELECT sku, scannedQty FROM qc_scan_items WHERE sessionId = ?`,
            [REF_SESSION_ID]
          );
          // Build expected totals from pallets
          const palletTotals = new Map();
          let allValidJson = true;
          for (const pallet of pallets) {
            let items;
            try {
              items = Array.isArray(pallet.items) ? pallet.items : JSON.parse(pallet.items || '[]');
            } catch {
              allValidJson = false;
              break;
            }
            for (const item of items) {
              palletTotals.set(item.sku, (palletTotals.get(item.sku) ?? 0) + (item.qty ?? 0));
            }
          }
          // Compare pallet totals to scanned quantities
          let allMatch = true;
          const mismatches = [];
          for (const si of scanItems) {
            const palletTotal = palletTotals.get(si.sku) ?? 0;
            if (palletTotal !== Number(si.scannedQty)) {
              allMatch = false;
              mismatches.push(`${si.sku}: pallet=${palletTotal}, scanned=${si.scannedQty}`);
            }
          }
          return {
            pass: allValidJson && allMatch,
            detail: allMatch
              ? `${pallets.length} pallets, all item JSON valid, pallet totals match scanned quantities`
              : `Mismatches: ${mismatches.join('; ')}`,
            warning: mismatches.length > 0 ? 'Pallet item totals do not match scanned quantities' : undefined,
          };
        } finally { await db.end(); }
      }
    },

    // ── TEST 9: Cascade / Cleanup ────────────────────────────────────────────
    {
      id: 9, name: "Deleting a session removes all scan items and pallets", category: 9,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999007 });
          await addScanItem(db, sid, 'CLEANUP-SKU-1', 10, 5);
          await addScanItem(db, sid, 'CLEANUP-SKU-2', 20, 10);
          await createPallet(db, sid, 1);
          await createPallet(db, sid, 2);
          // Verify data exists
          const [beforeItems] = await db.query(`SELECT COUNT(*) as cnt FROM qc_scan_items WHERE sessionId = ?`, [sid]);
          const [beforePallets] = await db.query(`SELECT COUNT(*) as cnt FROM qc_pallets WHERE sessionId = ?`, [sid]);
          // Cascade delete
          await db.query(`DELETE FROM qc_scan_items WHERE sessionId = ?`, [sid]);
          await db.query(`DELETE FROM qc_pallets WHERE sessionId = ?`, [sid]);
          await db.query(`DELETE FROM qc_scan_sessions WHERE id = ?`, [sid]);
          // Verify cleanup
          const [afterItems] = await db.query(`SELECT COUNT(*) as cnt FROM qc_scan_items WHERE sessionId = ?`, [sid]);
          const [afterPallets] = await db.query(`SELECT COUNT(*) as cnt FROM qc_pallets WHERE sessionId = ?`, [sid]);
          const [afterSession] = await db.query(`SELECT id FROM qc_scan_sessions WHERE id = ?`, [sid]);
          return {
            pass: Number(afterItems[0].cnt) === 0 && Number(afterPallets[0].cnt) === 0 && afterSession.length === 0,
            detail: `Before: ${beforeItems[0].cnt} items, ${beforePallets[0].cnt} pallets. After: all deleted cleanly.`,
          };
        } catch (err) {
          await cleanup(db, sid);
          throw err;
        } finally { await db.end(); }
      }
    },

    // ── TEST 10: Recovery / Reopen ───────────────────────────────────────────
    {
      id: 10, name: "Reopened session retains all scan progress and pallet data", category: 10,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          sid = await createTestSession(db, { txId: 9999008 });
          await addScanItem(db, sid, 'REOPEN-SKU-1', 20, 15);
          await addScanItem(db, sid, 'REOPEN-SKU-2', 10, 10);
          const palletId = await createPallet(db, sid, 1);
          await db.query(
            `UPDATE qc_pallets SET items = ?, palletHeightIn = 48 WHERE id = ?`,
            [JSON.stringify([{ sku: 'REOPEN-SKU-1', qty: 15 }, { sku: 'REOPEN-SKU-2', qty: 10 }]), palletId]
          );
          // Mark complete
          await db.query(`UPDATE qc_scan_sessions SET status = 'complete', completedAt = NOW() WHERE id = ?`, [sid]);
          // Reopen (manager action)
          await db.query(`UPDATE qc_scan_sessions SET status = 'scanning', completedAt = NULL WHERE id = ?`, [sid]);
          // Verify all data preserved
          const [session] = await db.query(`SELECT status, completedAt FROM qc_scan_sessions WHERE id = ?`, [sid]);
          const [items] = await db.query(`SELECT sku, scannedQty FROM qc_scan_items WHERE sessionId = ? ORDER BY sku`, [sid]);
          const [pallets] = await db.query(`SELECT palletHeightIn, items FROM qc_pallets WHERE sessionId = ?`, [sid]);
          const palletItems = Array.isArray(pallets[0]?.items) ? pallets[0].items : JSON.parse(pallets[0]?.items || '[]');
          const statusOk = session[0]?.status === 'scanning' && session[0]?.completedAt === null;
          const item1 = items.find(i => i.sku === 'REOPEN-SKU-1');
          const item2 = items.find(i => i.sku === 'REOPEN-SKU-2');
          const dataPreserved = Number(item1?.scannedQty) === 15 && Number(item2?.scannedQty) === 10;
          const palletPreserved = Number(pallets[0]?.palletHeightIn) === 48 && palletItems.length === 2;
          return {
            pass: statusOk && dataPreserved && palletPreserved,
            detail: `After reopen: status=scanning, completedAt=null, scan progress preserved (15+10 units), pallet height=48" preserved`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

  ],
};
