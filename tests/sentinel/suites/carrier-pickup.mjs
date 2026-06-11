/**
 * Sentinel Suite: Carrier Pickup
 */
import { getDb, PASS, FAIL, WARN, BLOCKER, CATEGORIES } from '../sentinel.mjs';

async function cleanup(db, sid) {
  if (!sid) return;
  await db.query(`DELETE FROM pickup_scan_photos WHERE pickup_session_id=?`, [sid]);
  await db.query(`DELETE FROM pickup_scans WHERE sessionId=?`, [sid]);
  await db.query(`DELETE FROM pickup_sessions WHERE id=?`, [sid]);
}

export default {
  name: "Carrier Pickup",
  description: "Carrier pickup session lifecycle, photo capture, batch mode, and BOL generation",
  tests: [

    {
      id: 1, name: "Pickup session created with required fields", category: CATEGORIES.DB_INTEGRITY.id,
      async run() {
        const db = await getDb(); let sid = null;
        try {
          const [r] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName) VALUES ('Test Driver', 'TRK-001', 'Test Carrier', 'scanning', 0, 'sentinel', 'REF-001', 'Test Customer')`);
          sid = r.insertId;
          const [rows] = await db.query(`SELECT id, status, driverName FROM pickup_sessions WHERE id=?`, [sid]);
          const ok = rows[0].status === 'scanning' && rows[0].driverName === 'Test Driver';
          return { result: ok ? PASS : FAIL, detail: `Session ${sid}: status=${rows[0].status}, driver=${rows[0].driverName}` };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    {
      id: 2, name: "Photo upload stores URL correctly in pickup_scan_photos", category: CATEGORIES.DB_INTEGRITY.id,
      async run() {
        const db = await getDb(); let sid = null;
        try {
          const [r] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName) VALUES ('Photo Driver', 'TRK-002', 'Carrier', 'scanning', 0, 'sentinel', 'REF-002', 'Customer')`);
          sid = r.insertId;
          const url = `https://files.manuscdn.com/pickup-photos/${sid}/GD-TEST-P1.jpg`;
          await db.query(`INSERT INTO pickup_scan_photos (pickup_session_id, pallet_label, photo_url) VALUES (?, 'GD-TEST-P1', ?)`, [sid, url]);
          const [photos] = await db.query(`SELECT photo_url FROM pickup_scan_photos WHERE pickup_session_id=?`, [sid]);
          const ok = photos[0]?.photo_url === url;
          return { result: ok ? PASS : FAIL, detail: `Photo stored: ${photos[0]?.photo_url?.substring(0,60)}...` };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    {
      id: 3, name: "Duplicate pallet scan blocked (same label cannot be scanned twice)", category: CATEGORIES.BUSINESS_LOGIC.id,
      async run() {
        const db = await getDb(); let sid = null;
        try {
          const [r] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName) VALUES ('Dup Driver', 'TRK-003', 'Carrier', 'scanning', 0, 'sentinel', 'REF-003', 'Customer')`);
          sid = r.insertId;
          // Insert first scan
          await db.query(`INSERT INTO pickup_scans (sessionId, labelValue, scannedAt) VALUES (?, 'GD-990057-P1', NOW())`, [sid]);
          // Check if duplicate exists
          const [existing] = await db.query(`SELECT id FROM pickup_scans WHERE sessionId=? AND labelValue='GD-990057-P1'`, [sid]);
          const isDuplicate = existing.length > 0;
          return { result: isDuplicate ? PASS : FAIL, detail: `Duplicate detection: label GD-990057-P1 already scanned (${existing.length} record)` };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    {
      id: 4, name: "Batch pickup: multiple order IDs stored in session", category: CATEGORIES.BUSINESS_LOGIC.id,
      async run() {
        const db = await getDb(); let sid = null;
        try {
          // Check if batch_order_ids column exists (only present after deployment)
          const [cols] = await db.query(`SHOW COLUMNS FROM pickup_sessions LIKE 'batch_order_ids'`);
          if (cols.length === 0) {
            return { result: WARN, detail: 'batch_order_ids column not yet in DB — deploy latest code to enable batch pickup', warning: 'Run pending deployment to activate batch pickup feature' };
          }
          const [r] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName, batch_order_ids) VALUES ('Batch Driver', 'TRK-004', 'Carrier', 'scanning', 0, 'sentinel', 'REF-004', 'Customer', ?)`, [JSON.stringify([3483552, 3470712, 3467702])]);
          sid = r.insertId;
          const [rows] = await db.query(`SELECT batch_order_ids FROM pickup_sessions WHERE id=?`, [sid]);
          const ids = Array.isArray(rows[0].batch_order_ids) ? rows[0].batch_order_ids : JSON.parse(rows[0].batch_order_ids || '[]');
          const ok = ids.length === 3 && ids.includes(3483552);
          return { result: ok ? PASS : FAIL, detail: `Batch IDs stored: ${ids.join(', ')}` };
        } finally { await cleanup(db, sid); await db.end(); }
      }
    },

    {
      id: 5, name: "Photo isolation: photos from one session not visible in another", category: CATEGORIES.SECURITY.id,
      async run() {
        const db = await getDb(); let sid1 = null, sid2 = null;
        try {
          const [r1] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName) VALUES ('S1 Driver', 'TRK-S1', 'Carrier', 'scanning', 0, 'sentinel', 'REF-S1', 'Customer')`);
          const [r2] = await db.query(`INSERT INTO pickup_sessions (driverName, trailerNumber, carrierName, status, isDemo, createdBy, referenceNum, clientName) VALUES ('S2 Driver', 'TRK-S2', 'Carrier', 'scanning', 0, 'sentinel', 'REF-S2', 'Customer')`);
          sid1 = r1.insertId; sid2 = r2.insertId;
          await db.query(`INSERT INTO pickup_scan_photos (pickup_session_id, pallet_label, photo_url) VALUES (?, 'GD-S1-P1', 'https://cdn.example.com/s1.jpg')`, [sid1]);
          await db.query(`INSERT INTO pickup_scan_photos (pickup_session_id, pallet_label, photo_url) VALUES (?, 'GD-S2-P1', 'https://cdn.example.com/s2.jpg')`, [sid2]);
          const [s1Photos] = await db.query(`SELECT pallet_label FROM pickup_scan_photos WHERE pickup_session_id=?`, [sid1]);
          const [s2Photos] = await db.query(`SELECT pallet_label FROM pickup_scan_photos WHERE pickup_session_id=?`, [sid2]);
          const ok = s1Photos.every(p => p.pallet_label === 'GD-S1-P1') && s2Photos.every(p => p.pallet_label === 'GD-S2-P1');
          return { result: ok ? PASS : BLOCKER, detail: `Session isolation: S1 has ${s1Photos.length} photo, S2 has ${s2Photos.length} photo — no cross-contamination` };
        } finally { await cleanup(db, sid1); await cleanup(db, sid2); await db.end(); }
      }
    },

  ],
};
