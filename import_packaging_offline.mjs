/**
 * Offline import: uses clientId=0 + clientName from spreadsheet.
 * Run reconcile_client_ids.mjs later to backfill real Extensiv customer IDs.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const XLSX = require('/home/ubuntu/node_modules/xlsx');

const CONFIG_ID = 3;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to DB\n');

// ── Parse spreadsheet ─────────────────────────────────────────────────────────
const wb = XLSX.readFile('/home/ubuntu/upload/Packaging_by_Customer.xlsx');
const ws = wb.Sheets['Packaging by Customer'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`Spreadsheet rows: ${rows.length}`);

function normalize(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function categorize(name, h) {
  const n = (name ?? '').toLowerCase();
  if (n.includes('pallet') || n.includes('skid')) return 'pallet';
  if (n.includes('envelope') || n.includes('mailer') || n.includes('poly bag') ||
      n.includes('polybag') || n.includes('bag') || n.includes('pouch') ||
      (h != null && h <= 1.0)) return 'envelope';
  return 'box';
}

// ── Deduplicate packages → insert into packaging_inventory ────────────────────
const inventoryMap = new Map();
for (const row of rows) {
  const rawName = (row['Package Name'] ?? '').trim();
  if (!rawName) continue;
  const L = row['Length (in)'];
  const W = row['Width (in)'];
  const H = row['Height (in)'];
  const category = categorize(rawName, H);
  const key = normalize(rawName);
  if (!inventoryMap.has(key)) {
    const dimParts = [L, W, H].filter(v => v != null);
    const notes = dimParts.length > 0 ? dimParts.join('×') + ' in' : null;
    inventoryMap.set(key, { name: rawName, category, notes });
  }
}
console.log(`Unique packages: ${inventoryMap.size}`);

const [existingInv] = await conn.execute(
  'SELECT id, name FROM packaging_inventory WHERE configId = ?', [CONFIG_ID]
);
const existingNames = new Map(existingInv.map(r => [normalize(r.name), r.id]));
console.log(`Existing inventory items: ${existingNames.size}`);

let invInserted = 0, invSkipped = 0;
const nameToInvId = new Map();

for (const [key, pkg] of inventoryMap) {
  if (existingNames.has(key)) {
    nameToInvId.set(key, existingNames.get(key));
    invSkipped++;
    continue;
  }
  const [result] = await conn.execute(
    `INSERT INTO packaging_inventory (configId, facilityId, name, category, unit, onHandQty, minStockLevel, weeklyConsumption, notes, isCustom, createdAt, updatedAt)
     VALUES (?, 0, ?, ?, 'each', 0, 0, 0, ?, 1, NOW(), NOW())`,
    [CONFIG_ID, pkg.name, pkg.category, pkg.notes]
  );
  nameToInvId.set(key, result.insertId);
  invInserted++;
}
console.log(`Inventory: ${invInserted} inserted, ${invSkipped} skipped (already exist)\n`);

// ── Insert client_packaging_enabled rows ──────────────────────────────────────
const [existingEnabled] = await conn.execute(
  'SELECT clientId, clientName, typeName FROM client_packaging_enabled WHERE configId = ?', [CONFIG_ID]
);
// Key by clientName+typeName (since clientId=0 for all new rows)
const existingEnabledSet = new Set(
  existingEnabled.map(r => `${normalize(r.clientName)}:${normalize(r.typeName)}`)
);

let enabledInserted = 0, enabledSkipped = 0;

for (const row of rows) {
  const sheetName = (row['Customer'] ?? '').trim();
  const rawName = (row['Package Name'] ?? '').trim();
  if (!sheetName || !rawName) continue;

  const H = row['Height (in)'];
  const category = categorize(rawName, H);
  const dbCategory = category === 'pallet' ? 'pallet' : 'package_unit';
  const key = `${normalize(sheetName)}:${normalize(rawName)}`;

  if (existingEnabledSet.has(key)) {
    enabledSkipped++;
    continue;
  }
  existingEnabledSet.add(key);

  await conn.execute(
    `INSERT INTO client_packaging_enabled (configId, clientId, clientName, category, typeName, enabled, sortOrder, createdAt, updatedAt)
     VALUES (?, 0, ?, ?, ?, 1, 0, NOW(), NOW())`,
    [CONFIG_ID, sheetName, dbCategory, rawName]
  );
  enabledInserted++;
}

console.log(`client_packaging_enabled: ${enabledInserted} inserted, ${enabledSkipped} skipped`);

// ── Summary ───────────────────────────────────────────────────────────────────
const [invCount] = await conn.execute('SELECT COUNT(*) as cnt FROM packaging_inventory WHERE configId = ?', [CONFIG_ID]);
const [enabledCount] = await conn.execute('SELECT COUNT(*) as cnt FROM client_packaging_enabled WHERE configId = ?', [CONFIG_ID]);
const [clientCount] = await conn.execute('SELECT COUNT(DISTINCT clientName) as cnt FROM client_packaging_enabled WHERE configId = ?', [CONFIG_ID]);
console.log(`\n📦 Total inventory items: ${invCount[0].cnt}`);
console.log(`✅ Total enabled assignments: ${enabledCount[0].cnt}`);
console.log(`👥 Total clients with packages: ${clientCount[0].cnt}`);

await conn.end();
console.log('\n✅ Import complete!');
