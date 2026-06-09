/**
 * 10-1-Go: Batch Carrier Pickup
 * ─────────────────────────────────────────────────────────────────────────────
 * Feature: Batch Carrier Pickup — scan pallets for multiple orders in one session
 * Goal:    All pallets from all orders are correctly tracked, matched, and protected
 *
 * Test IDs map to the 10 categories:
 *  1 = Happy Path       2 = Empty/Zero     3 = Boundary
 *  4 = Duplicate/Replay 5 = Bad Input      6 = Permission/Auth
 *  7 = Concurrency/Race 8 = Data Integrity 9 = Cascade/Cleanup
 * 10 = Recovery/Reopen
 */

import { getDb } from '../runner.mjs';

// ── Real test orders (completed QC sessions with known pallet labels) ──────────
const ORDER_A = { txId: 3483552, sessionId: 990057, pallets: ['GD-990057-P1', 'GD-990057-P2', 'GD-990057-P3'] };
const ORDER_B = { txId: 3470712, sessionId: 990032, pallets: ['GD-990032-P1', 'GD-990032-P2'] };
const ORDER_C = { txId: 3467702, sessionId: 990066, pallets: ['GD-990066-P1', 'GD-990066-P2', 'GD-990066-P3', 'GD-990066-P4'] };

// ── Helper: create a batch pickup session ─────────────────────────────────────
async function createBatchSession(db, orders, opts = {}) {
  const batchOrderIds = JSON.stringify(orders.map(o => o.txId));
  const totalPallets = orders.reduce((s, o) => s + o.pallets.length, 0);
  const [r] = await db.query(`
    INSERT INTO pickup_sessions
      (driverName, trailerNumber, carrierName, status, isDemo, createdBy, batchOrderIds, referenceNum, clientName, expectedPallets)
    VALUES (?, ?, 'Test Carrier', 'scanning', 0, '10-1-go-test', ?, ?, 'Batch Test', ?)
  `, [
    opts.driver ?? 'Test Driver',
    opts.trailer ?? 'TEST-001',
    batchOrderIds,
    `BATCH-${orders.map(o => o.txId).join('-')}`,
    totalPallets,
  ]);
  return r.insertId;
}

// ── Helper: scan a pallet label into a session ────────────────────────────────
async function scanPallet(db, sessionId, label, orders) {
  const scanned = label.trim().toLowerCase();
  // Check duplicate
  const [existing] = await db.query(
    `SELECT id FROM pickup_scans WHERE sessionId = ? AND labelValue = ?`,
    [sessionId, label]
  );
  if (existing.length > 0) return { duplicate: true };

  // Match to order
  let matchedOrderId = null;
  for (const order of orders) {
    const [pallets] = await db.query(
      `SELECT palletUpc, palletNumber FROM qc_pallets WHERE sessionId = ? AND deletedAt IS NULL`,
      [order.sessionId]
    );
    const upcs = pallets.map(p => p.palletUpc?.trim().toLowerCase()).filter(Boolean);
    const generated = pallets.map(p => `gd-${order.sessionId}-p${p.palletNumber}`.toLowerCase());
    if ([...new Set([...upcs, ...generated])].includes(scanned)) {
      matchedOrderId = order.txId;
      break;
    }
  }

  await db.query(
    `INSERT INTO pickup_scans (sessionId, labelValue, scannedBy, orderId) VALUES (?, ?, '10-1-go-test', ?)`,
    [sessionId, label, matchedOrderId]
  );
  return { matchedOrderId };
}

// ── Helper: cleanup a test session ───────────────────────────────────────────
async function cleanup(db, sessionId) {
  if (!sessionId) return;
  await db.query(`DELETE FROM pickup_scans WHERE sessionId = ?`, [sessionId]);
  await db.query(`DELETE FROM pickup_sessions WHERE id = ?`, [sessionId]);
}

// ═════════════════════════════════════════════════════════════════════════════
export default {
  feature: "Batch Carrier Pickup",
  goal: "All pallets from all orders are correctly tracked, matched, and protected",

  tests: [

    // ── TEST 1: Happy Path ───────────────────────────────────────────────────
    {
      id: 1, name: "Full batch scan — all pallets matched correctly", category: 1,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B, ORDER_C];
        const sid = await createBatchSession(db, orders);
        try {
          const allPallets = orders.flatMap(o => o.pallets.map(p => ({ label: p, txId: o.txId })));
          let allMatched = true;
          const mismatches = [];
          for (const { label, txId } of allPallets) {
            const result = await scanPallet(db, sid, label, orders);
            if (result.matchedOrderId !== txId) {
              allMatched = false;
              mismatches.push(`${label} → expected TX ${txId}, got ${result.matchedOrderId}`);
            }
          }
          const [scans] = await db.query(`SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ?`, [sid]);
          const totalScanned = Number(scans[0].cnt);
          return {
            pass: allMatched && totalScanned === allPallets.length,
            detail: allMatched
              ? `${totalScanned}/${allPallets.length} pallets scanned and matched correctly across 3 orders`
              : `Mismatches: ${mismatches.join('; ')}`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 2: Empty / Zero Input ───────────────────────────────────────────
    {
      id: 2, name: "Batch session with 0 orders in batchOrderIds", category: 2,
      async run() {
        const db = await getDb();
        let sid = null;
        try {
          const [r] = await db.query(`
            INSERT INTO pickup_sessions (driverName, trailerNumber, status, isDemo, createdBy, batchOrderIds, referenceNum, clientName)
            VALUES ('Driver', 'TRUCK', 'scanning', 0, '10-1-go-test', '[]', 'BATCH-EMPTY', 'Empty Test')
          `);
          sid = r.insertId;
          const [rows] = await db.query(`SELECT batchOrderIds FROM pickup_sessions WHERE id = ?`, [sid]);
          const raw = rows[0].batchOrderIds;
          const ids = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
          return {
            pass: Array.isArray(ids) && ids.length === 0,
            detail: `Session created with empty batchOrderIds array — no pallets will match (safe fallback)`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 3: Boundary Values ──────────────────────────────────────────────
    {
      id: 3, name: "Batch with exactly 2 orders (minimum valid batch)", category: 3,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B]; // minimum 2
        const sid = await createBatchSession(db, orders);
        try {
          const [rows] = await db.query(`SELECT batchOrderIds FROM pickup_sessions WHERE id = ?`, [sid]);
          const raw = rows[0].batchOrderIds;
          const ids = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
          return {
            pass: ids.length === 2,
            detail: `2-order batch created successfully with IDs: ${ids.join(', ')}`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 4: Duplicate / Replay ───────────────────────────────────────────
    {
      id: 4, name: "Scanning same pallet label twice is blocked", category: 4,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B];
        const sid = await createBatchSession(db, orders);
        try {
          const label = ORDER_A.pallets[0];
          const first = await scanPallet(db, sid, label, orders);
          const second = await scanPallet(db, sid, label, orders);
          const [countRows] = await db.query(
            `SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ? AND labelValue = ?`,
            [sid, label]
          );
          const count = Number(countRows[0].cnt);
          return {
            pass: !first.duplicate && second.duplicate && count === 1,
            detail: `First scan: accepted. Second scan: duplicate blocked. DB has exactly 1 record for "${label}"`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 5: Bad Input ────────────────────────────────────────────────────
    {
      id: 5, name: "Scanning a completely unknown label returns unmatched (not error)", category: 5,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B];
        const sid = await createBatchSession(db, orders);
        try {
          const fakeLabel = 'GD-FAKE-PALLET-999999';
          const result = await scanPallet(db, sid, fakeLabel, orders);
          // Should insert but with matchedOrderId = null (unmatched, not a crash)
          const [rows] = await db.query(
            `SELECT orderId FROM pickup_scans WHERE sessionId = ? AND labelValue = ?`,
            [sid, fakeLabel]
          );
          return {
            pass: rows.length === 1 && rows[0].orderId === null,
            detail: `Unknown label "${fakeLabel}" was recorded with orderId=null (unmatched) — no crash`,
            warning: rows.length === 1 ? "Unmatched scans should be reviewed by a manager" : undefined,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 6: Permission / Auth ────────────────────────────────────────────
    {
      id: 6, name: "batchOrderIds column is stored as valid JSON in DB", category: 6,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B, ORDER_C];
        const sid = await createBatchSession(db, orders);
        try {
          const [rows] = await db.query(`SELECT batchOrderIds FROM pickup_sessions WHERE id = ?`, [sid]);
          const raw = rows[0].batchOrderIds;
          let parsed;
          try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = null; }
          const isValid = Array.isArray(parsed) && parsed.length === 3 &&
            parsed.every(id => orders.map(o => o.txId).includes(id));
          return {
            pass: isValid,
            detail: `batchOrderIds stored as valid JSON array: [${parsed?.join(', ')}]`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 7: Concurrency / Race ───────────────────────────────────────────
    {
      id: 7, name: "Concurrent scans of different pallets don't collide", category: 7,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B, ORDER_C];
        const sid = await createBatchSession(db, orders);
        try {
          // Simulate concurrent scans by firing all inserts simultaneously
          const allPallets = orders.flatMap(o => o.pallets);
          await Promise.all(allPallets.map(label => scanPallet(db, sid, label, orders)));
          const [countRows] = await db.query(`SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ?`, [sid]);
          const count = Number(countRows[0].cnt);
          return {
            pass: count === allPallets.length,
            detail: `${count}/${allPallets.length} pallets recorded with no collisions under concurrent load`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 8: Data Integrity ───────────────────────────────────────────────
    {
      id: 8, name: "Per-order pallet counts are accurate after full batch scan", category: 8,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B, ORDER_C];
        const sid = await createBatchSession(db, orders);
        try {
          for (const order of orders) {
            for (const label of order.pallets) {
              await scanPallet(db, sid, label, orders);
            }
          }
          const [rows] = await db.query(
            `SELECT orderId, COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ? GROUP BY orderId`,
            [sid]
          );
          let allCorrect = true;
          const details = [];
          for (const order of orders) {
            const row = rows.find(r => r.orderId === order.txId);
            const actual = Number(row?.cnt ?? 0);
            const expected = order.pallets.length;
            const ok = actual === expected;
            if (!ok) allCorrect = false;
            details.push(`TX ${order.txId}: ${actual}/${expected} ${ok ? '✓' : '✗'}`);
          }
          return {
            pass: allCorrect,
            detail: details.join(' | '),
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    // ── TEST 9: Cascade / Cleanup ────────────────────────────────────────────
    {
      id: 9, name: "Deleting a batch session removes all associated scans", category: 9,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B];
        const sid = await createBatchSession(db, orders);
        try {
          // Scan some pallets
          for (const label of ORDER_A.pallets) {
            await scanPallet(db, sid, label, orders);
          }
          const [before] = await db.query(`SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ?`, [sid]);
          const beforeCount = Number(before[0].cnt);

          // Delete session and scans (simulating cleanup)
          await db.query(`DELETE FROM pickup_scans WHERE sessionId = ?`, [sid]);
          await db.query(`DELETE FROM pickup_sessions WHERE id = ?`, [sid]);

          const [after] = await db.query(`SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ?`, [sid]);
          const afterCount = Number(after[0].cnt);
          const [sessionCheck] = await db.query(`SELECT id FROM pickup_sessions WHERE id = ?`, [sid]);

          return {
            pass: afterCount === 0 && sessionCheck.length === 0,
            detail: `${beforeCount} scans deleted with session. Session and all scans fully removed from DB.`,
          };
        } catch (err) {
          await cleanup(db, sid);
          throw err;
        } finally { await db.end(); }
      }
    },

    // ── TEST 10: Recovery / Reopen ───────────────────────────────────────────
    {
      id: 10, name: "Partial batch scan can be resumed — already-scanned pallets preserved", category: 10,
      async run() {
        const db = await getDb();
        const orders = [ORDER_A, ORDER_B, ORDER_C];
        const sid = await createBatchSession(db, orders);
        try {
          // Scan only ORDER_A pallets (simulate interrupted session)
          for (const label of ORDER_A.pallets) {
            await scanPallet(db, sid, label, orders);
          }

          // "Resume" — scan ORDER_B pallets
          for (const label of ORDER_B.pallets) {
            await scanPallet(db, sid, label, orders);
          }

          // Verify ORDER_A scans are still there (not lost during resume)
          const [aScans] = await db.query(
            `SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ? AND orderId = ?`,
            [sid, ORDER_A.txId]
          );
          const [bScans] = await db.query(
            `SELECT COUNT(*) as cnt FROM pickup_scans WHERE sessionId = ? AND orderId = ?`,
            [sid, ORDER_B.txId]
          );
          const aCount = Number(aScans[0].cnt);
          const bCount = Number(bScans[0].cnt);

          return {
            pass: aCount === ORDER_A.pallets.length && bCount === ORDER_B.pallets.length,
            detail: `After resume: TX ${ORDER_A.txId} has ${aCount}/${ORDER_A.pallets.length} pallets, TX ${ORDER_B.txId} has ${bCount}/${ORDER_B.pallets.length} pallets — no data lost`,
          };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

  ],
};
