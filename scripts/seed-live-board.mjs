/**
 * seed-live-board.mjs
 * Seeds realistic mock data for the Live Pull Board demo:
 *   - 9 warehouse associates across COL, TOR, CAL
 *   - 9 active pull sessions with varied pace statuses (ahead / on-pace / behind)
 *   - 10 minutes of pace snapshots per session (1-minute buckets)
 *   - pull_alert_settings with expected_items_per_hour per warehouse
 *
 * Run: node scripts/seed-live-board.mjs
 * Safe to re-run: clears only mock data inserted by this script (associate_id starts with "MOCK-")
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MIN = 60_000;
const HOUR = 3_600_000;

function minsAgo(m) { return now - m * MIN; }

// ─── 1. Clean up previous mock data ──────────────────────────────────────────
console.log("Cleaning previous mock data…");
await conn.execute(`DELETE FROM pull_pace_snapshots WHERE session_id IN (
  SELECT id FROM pull_sessions WHERE associate_id LIKE 'MOCK-%'
)`);
await conn.execute(`DELETE FROM pull_sessions WHERE associate_id LIKE 'MOCK-%'`);
await conn.execute(`DELETE FROM warehouse_associates WHERE associate_id LIKE 'MOCK-%'`);

// ─── 2. Associates ────────────────────────────────────────────────────────────
const associates = [
  // COL - Columbus
  { id: "MOCK-COL-001", name: "Marcus Webb",    warehouse: "COL", role: "Picker" },
  { id: "MOCK-COL-002", name: "Destiny Flores", warehouse: "COL", role: "Picker" },
  { id: "MOCK-COL-003", name: "James Okafor",   warehouse: "COL", role: "Lead Picker" },
  // TOR - Toronto
  { id: "MOCK-TOR-001", name: "Priya Sharma",   warehouse: "TOR", role: "Picker" },
  { id: "MOCK-TOR-002", name: "Liam Nguyen",    warehouse: "TOR", role: "Picker" },
  { id: "MOCK-TOR-003", name: "Aisha Kamara",   warehouse: "TOR", role: "Lead Picker" },
  // CAL - Calgary
  { id: "MOCK-CAL-001", name: "Tyler Brooks",   warehouse: "CAL", role: "Picker" },
  { id: "MOCK-CAL-002", name: "Sofia Reyes",    warehouse: "CAL", role: "Picker" },
  { id: "MOCK-CAL-003", name: "Devon Patel",    warehouse: "CAL", role: "Lead Picker" },
];

console.log("Inserting associates…");
for (const a of associates) {
  await conn.execute(
    `INSERT INTO warehouse_associates (associate_id, name, warehouse_id, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [a.id, a.name, a.warehouse, a.role, now, now]
  );
}

// ─── 3. Pull alert settings (expected rate per warehouse) ─────────────────────
const warehouseRates = [
  { warehouse: "COL", rate: 45, threshold: 30 },
  { warehouse: "TOR", rate: 40, threshold: 25 },
  { warehouse: "CAL", rate: 50, threshold: 35 },
];

console.log("Upserting pull_alert_settings…");
for (const w of warehouseRates) {
  await conn.execute(
    `INSERT INTO pull_alert_settings
       (warehouse_id, threshold_minutes, enabled, re_alert_multiplier, expected_items_per_hour, created_at, updated_at)
     VALUES (?, ?, 1, 2.0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       expected_items_per_hour = VALUES(expected_items_per_hour),
       threshold_minutes = VALUES(threshold_minutes),
       updated_at = VALUES(updated_at)`,
    [w.warehouse, w.threshold, w.rate, now, now]
  );
}

// ─── 4. Active pull sessions ──────────────────────────────────────────────────
// Each session: pick_ticket, associate, warehouse, started_at, items_scanned
// We vary elapsed time and items to produce ahead / on_pace / behind statuses
const sessions = [
  // COL — Columbus (rate: 45/hr = 0.75/min)
  {
    ticket: "#COL-8821", assocId: "MOCK-COL-001", assocName: "Marcus Webb",
    warehouse: "COL", startedMinsAgo: 47, itemsScanned: 40,
    // ghost = 0.75 * 47 = 35.25 → ratio = 40/35.25 = 1.13 → AHEAD
  },
  {
    ticket: "#COL-8822", assocId: "MOCK-COL-002", assocName: "Destiny Flores",
    warehouse: "COL", startedMinsAgo: 22, itemsScanned: 16,
    // ghost = 0.75 * 22 = 16.5 → ratio = 16/16.5 = 0.97 → ON PACE
  },
  {
    ticket: "#COL-8823", assocId: "MOCK-COL-003", assocName: "James Okafor",
    warehouse: "COL", startedMinsAgo: 35, itemsScanned: 18,
    // ghost = 0.75 * 35 = 26.25 → ratio = 18/26.25 = 0.69 → BEHIND
  },
  // TOR — Toronto (rate: 40/hr = 0.667/min)
  {
    ticket: "#TOR-5541", assocId: "MOCK-TOR-001", assocName: "Priya Sharma",
    warehouse: "TOR", startedMinsAgo: 58, itemsScanned: 52,
    // ghost = 0.667 * 58 = 38.7 → ratio = 52/38.7 = 1.34 → AHEAD
  },
  {
    ticket: "#TOR-5542", assocId: "MOCK-TOR-002", assocName: "Liam Nguyen",
    warehouse: "TOR", startedMinsAgo: 14, itemsScanned: 9,
    // ghost = 0.667 * 14 = 9.3 → ratio = 9/9.3 = 0.97 → ON PACE
  },
  {
    ticket: "#TOR-5543", assocId: "MOCK-TOR-003", assocName: "Aisha Kamara",
    warehouse: "TOR", startedMinsAgo: 41, itemsScanned: 20,
    // ghost = 0.667 * 41 = 27.3 → ratio = 20/27.3 = 0.73 → BEHIND
  },
  // CAL — Calgary (rate: 50/hr = 0.833/min)
  {
    ticket: "#CAL-3301", assocId: "MOCK-CAL-001", assocName: "Tyler Brooks",
    warehouse: "CAL", startedMinsAgo: 30, itemsScanned: 29,
    // ghost = 0.833 * 30 = 25 → ratio = 29/25 = 1.16 → AHEAD
  },
  {
    ticket: "#CAL-3302", assocId: "MOCK-CAL-002", assocName: "Sofia Reyes",
    warehouse: "CAL", startedMinsAgo: 19, itemsScanned: 15,
    // ghost = 0.833 * 19 = 15.8 → ratio = 15/15.8 = 0.95 → ON PACE
  },
  {
    ticket: "#CAL-3303", assocId: "MOCK-CAL-003", assocName: "Devon Patel",
    warehouse: "CAL", startedMinsAgo: 52, itemsScanned: 28,
    // ghost = 0.833 * 52 = 43.3 → ratio = 28/43.3 = 0.65 → BEHIND
  },
];

console.log("Inserting pull sessions…");
const sessionIds = [];
for (const s of sessions) {
  const startedAt = minsAgo(s.startedMinsAgo);
  const [result] = await conn.execute(
    `INSERT INTO pull_sessions
       (pick_ticket, associate_id, associate_name, warehouse_id, status, started_at,
        total_items, total_pallets, total_cases, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL)`,
    [s.ticket, s.assocId, s.assocName, s.warehouse, startedAt,
     s.itemsScanned, s.totalPallets ?? 0, s.totalCases ?? 0]
  );
  sessionIds.push({ id: result.insertId, session: s });
}

// ─── 5. Pace snapshots (10 one-minute buckets per session) ────────────────────
console.log("Inserting pace snapshots…");
for (const { id: sessionId, session: s } of sessionIds) {
  const ratePerMin = warehouseRates.find(w => w.warehouse === s.warehouse).rate / 60;
  const elapsedMins = s.startedMinsAgo;

  // Generate 10 buckets ending at (now - 1 min) going back 10 minutes
  // Vary the items/hr to create an interesting sparkline shape
  const bucketCount = Math.min(10, elapsedMins);
  for (let i = bucketCount; i >= 1; i--) {
    const bucketTs = now - i * MIN;

    // Create realistic variation: ahead sessions trend up, behind sessions trend down
    let variance;
    const paceRatio = s.itemsScanned / (ratePerMin * elapsedMins);
    if (paceRatio >= 1.05) {
      // Ahead: start slightly below rate, ramp up
      variance = 1.0 + ((bucketCount - i) / bucketCount) * 0.4;
    } else if (paceRatio >= 0.85) {
      // On pace: gentle oscillation around target
      variance = 0.9 + Math.sin((i / bucketCount) * Math.PI) * 0.2;
    } else {
      // Behind: start near rate, drop off
      variance = 1.1 - ((bucketCount - i) / bucketCount) * 0.5;
    }

    const itemsInBucket = Math.max(1, Math.round(ratePerMin * variance));
    const itemsPerHour = Math.round(itemsInBucket * 60);

    await conn.execute(
      `INSERT INTO pull_pace_snapshots (session_id, bucket_ts, items_in_bucket, items_per_hour)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE items_in_bucket = VALUES(items_in_bucket), items_per_hour = VALUES(items_per_hour)`,
      [sessionId, bucketTs, itemsInBucket, itemsPerHour]
    );
  }
}

await conn.end();

console.log(`\n✅ Seeded successfully:`);
console.log(`   ${associates.length} associates across COL, TOR, CAL`);
console.log(`   ${sessions.length} active pull sessions (3 ahead, 3 on-pace, 3 behind)`);
console.log(`   ~${sessions.length * 10} pace snapshots (10 buckets per session)`);
console.log(`   3 warehouse alert settings with expected_items_per_hour`);
console.log(`\nOpen the Live Pull Board to see the data.`);
