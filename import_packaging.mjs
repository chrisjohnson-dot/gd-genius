/**
 * Import packaging data from Packaging_by_Customer.xlsx into the DB.
 * Uses axios (already in project deps) to avoid Node.js fetch TLS issues.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const axios = require('axios').default;
const XLSX = require('/home/ubuntu/node_modules/xlsx');

const CONFIG_ID = 3;

// ── 1. Connect to DB ──────────────────────────────────────────────────────────
const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to DB\n');

// ── 2. Fetch Extensiv config ──────────────────────────────────────────────────
const [configRows] = await conn.execute(
  'SELECT id, clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE id = ?',
  [CONFIG_ID]
);
const config = configRows[0];
if (!config) { console.error('Config not found'); process.exit(1); }

// ── 3. Get OAuth2 token ───────────────────────────────────────────────────────
console.log('Getting Extensiv OAuth2 token...');
const base64Auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
const tplGuid = config.tplGuid.replace(/[{}]/g, '');

const tokenResp = await axios.post(
  `${config.baseUrl}/AuthServer/api/Token`,
  new URLSearchParams({
    grant_type: 'client_credentials',
    tpl: `{${tplGuid}}`,
    user_login_id: String(config.userLoginId),
  }).toString(),
  {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${base64Auth}`,
    },
  }
);
const token = tokenResp.data.access_token;
if (!token) { console.error('No token:', tokenResp.data); process.exit(1); }
console.log('Token obtained\n');

// ── 4. Fetch all Extensiv customers ──────────────────────────────────────────
console.log('Fetching Extensiv customers...');
const custResp = await axios.get(`${config.baseUrl}/api/customers`, {
  params: { pgsiz: 500, pgnum: 1 },
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/hal+json',
    'Accept-Language': 'en-US,en;q=0.8',
  },
});
const rawCustomers = custResp.data?._embedded?.['http://api.3plCentral.com/rels/customers/customer'] ?? [];
const extensivCustomers = rawCustomers.map(c => ({
  id: c.readOnly?.customerId ?? c.id ?? 0,
  name: (c.companyInfo?.companyName ?? c.name ?? '').trim(),
})).filter(c => c.id && c.name);
console.log(`Fetched ${extensivCustomers.length} Extensiv customers\n`);

// ── 5. Parse spreadsheet ──────────────────────────────────────────────────────
const wb = XLSX.readFile('/home/ubuntu/upload/Packaging_by_Customer.xlsx');
const ws = wb.Sheets['Packaging by Customer'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`Spreadsheet rows: ${rows.length}\n`);

// ── 6. Match customer names ───────────────────────────────────────────────────
function normalize(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchCustomer(sheetName) {
  const n = normalize(sheetName);
  let match = extensivCustomers.find(c => normalize(c.name) === n);
  if (match) return match;
  match = extensivCustomers.find(c => normalize(c.name).includes(n) || n.includes(normalize(c.name)));
  return match ?? null;
}

const customerIdMap = new Map();
let matched = 0, unmatched = 0;

for (const row of rows) {
  const sheetName = row['Customer'];
  if (!sheetName || customerIdMap.has(sheetName)) continue;
  const match = matchCustomer(sheetName);
  if (match) {
    customerIdMap.set(sheetName, match);
    matched++;
    console.log(`  ✅ "${sheetName}" → ${match.id}: "${match.name}"`);
  } else {
    customerIdMap.set(sheetName, { id: 0, name: sheetName });
    unmatched++;
    console.log(`  ⚠️  "${sheetName}" → no Extensiv match (clientId=0)`);
  }
}
console.log(`\nMatched: ${matched}, Unmatched (clientId=0): ${unmatched}\n`);

// ── 7. Categorize packages ────────────────────────────────────────────────────
function categorize(name, h) {
  const n = (name ?? '').toLowerCase();
  if (n.includes('pallet') || n.includes('skid')) return 'pallet';
  if (n.includes('envelope') || n.includes('mailer') || n.includes('poly bag') ||
      n.includes('polybag') || n.includes('bag') || n.includes('pouch') ||
      (h != null && h <= 1.0)) return 'envelope';
  return 'box';
}

// ── 8. Deduplicate packages → insert into packaging_inventory ─────────────────
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
console.log(`Unique packages to insert: ${inventoryMap.size}`);

const [existingInv] = await conn.execute(
  'SELECT id, name FROM packaging_inventory WHERE configId = ?', [CONFIG_ID]
);
const existingNames = new Map(existingInv.map(r => [normalize(r.name), r.id]));
console.log(`Existing inventory items: ${existingNames.size}`);

const nameToInvId = new Map();
let invInserted = 0, invSkipped = 0;

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
console.log(`Inventory: ${invInserted} inserted, ${invSkipped} already existed\n`);

// ── 9. Insert client_packaging_enabled rows ───────────────────────────────────
const [existingEnabled] = await conn.execute(
  'SELECT clientId, typeName FROM client_packaging_enabled WHERE configId = ?', [CONFIG_ID]
);
const existingEnabledSet = new Set(existingEnabled.map(r => `${r.clientId}:${normalize(r.typeName)}`));

let enabledInserted = 0, enabledSkipped = 0;

for (const row of rows) {
  const sheetName = row['Customer'];
  const rawName = (row['Package Name'] ?? '').trim();
  if (!sheetName || !rawName) continue;

  const clientInfo = customerIdMap.get(sheetName);
  const clientId = clientInfo?.id ?? 0;
  const clientName = clientInfo?.name ?? sheetName;
  const H = row['Height (in)'];
  const category = categorize(rawName, H);
  const dbCategory = category === 'pallet' ? 'pallet' : 'package_unit';
  const key = `${clientId}:${normalize(rawName)}`;

  if (existingEnabledSet.has(key)) {
    enabledSkipped++;
    continue;
  }
  existingEnabledSet.add(key);

  await conn.execute(
    `INSERT INTO client_packaging_enabled (configId, clientId, clientName, category, typeName, enabled, sortOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
    [CONFIG_ID, clientId, clientName, dbCategory, rawName]
  );
  enabledInserted++;
}

console.log(`client_packaging_enabled: ${enabledInserted} inserted, ${enabledSkipped} already existed`);
await conn.end();
console.log('\n✅ Import complete!');
