import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE id=3');
const cfg = rows[0];
await conn.end();

const BASE = cfg.baseUrl;

async function getToken() {
  const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${BASE}/AuthServer/api/Token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      tpl: `{${cfg.tplGuid}}`,
      user_login_id: String(cfg.userLoginId),
    }),
  });
  return (await res.json()).access_token;
}

const token = await getToken();
console.log('Authenticated ✓\n');

// Get all customers
let allCusts = [];
let pg = 1;
while (true) {
  const res = await fetch(`${BASE}/customers?pgsiz=100&pgnum=${pg}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const d = await res.json();
  const list = d.ResourceList ?? [];
  allCusts = allCusts.concat(list);
  if (allCusts.length >= d.TotalResults || list.length === 0) break;
  pg++;
}

// Filter active
const active = allCusts.filter(c => {
  const deact = c.ReadOnly?.Deactivated;
  const name = c.CompanyInfo?.CompanyName ?? '';
  return !deact && !name.includes('VACANT') && !name.includes('DEACTIVATE') && !name.includes('Deactivat');
});

console.log(`Total: ${allCusts.length} | Active: ${active.length}`);
console.log('First 10 active:', active.slice(0,10).map(c => `${c.CompanyInfo?.CompanyName} (${c.ReadOnly?.CustomerId})`).join(', '));

// Test items for first active customer
const firstActive = active[0];
const firstId = firstActive?.ReadOnly?.CustomerId;
const itemRes = await fetch(`${BASE}/customers/${firstId}/items?pgsiz=3&pgnum=1`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const itemData = await itemRes.json();
console.log(`\nCustomer ${firstId} (${firstActive?.CompanyInfo?.CompanyName}) items: ${itemData.TotalResults} total`);

const item = itemData.ResourceList?.[0];
if (item) {
  const pkg = item.Options?.PackageUnit;
  const pallet = item.Options?.Pallets;
  console.log('PackageUnit UnitIdentifier:', pkg?.UnitIdentifier?.Name, '(id:', pkg?.UnitIdentifier?.Id, ')');
  console.log('PackageUnit InventoryUnitsPerUnit:', pkg?.InventoryUnitsPerUnit);
  console.log('Pallets TypeIdentifier:', pallet?.TypeIdentifier?.Name);
}

// Now scan all active customers for packaging data
console.log('\n\nScanning all active customers for packaging data...\n');

const pkgSummary = new Map(); // unitName -> { count, customers }
const palletSummary = new Map();

for (const cust of active) {
  const custId = cust.ReadOnly?.CustomerId;
  const custName = cust.CompanyInfo?.CompanyName ?? `#${custId}`;
  
  // Just fetch first page to check
  const res = await fetch(`${BASE}/customers/${custId}/items?pgsiz=100&pgnum=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) continue;
  const data = await res.json();
  const items = data.ResourceList ?? [];
  
  const custPkgUnits = new Set();
  const custPalletTypes = new Set();
  
  for (const item of items) {
    const pkg = item.Options?.PackageUnit?.UnitIdentifier?.Name;
    const pallet = item.Options?.Pallets?.TypeIdentifier?.Name;
    if (pkg) custPkgUnits.add(pkg);
    if (pallet) custPalletTypes.add(pallet);
  }
  
  for (const name of custPkgUnits) {
    if (!pkgSummary.has(name)) pkgSummary.set(name, { count: 0, customers: [] });
    pkgSummary.get(name).count++;
    pkgSummary.get(name).customers.push(custName);
  }
  for (const name of custPalletTypes) {
    if (!palletSummary.has(name)) palletSummary.set(name, { count: 0, customers: [] });
    palletSummary.get(name).count++;
    palletSummary.get(name).customers.push(custName);
  }
  
  if (custPkgUnits.size > 0 || custPalletTypes.size > 0) {
    console.log(`  ${custName}: pkg=[${Array.from(custPkgUnits).join(', ')}] pallets=[${Array.from(custPalletTypes).join(', ')}]`);
  }
}

console.log('\n\n=== PACKAGE UNIT TYPES FOUND ===');
for (const [name, info] of pkgSummary) {
  console.log(`  ${name}: ${info.count} customer(s) — ${info.customers.slice(0,5).join(', ')}`);
}

console.log('\n=== PALLET TYPES FOUND ===');
for (const [name, info] of palletSummary) {
  console.log(`  ${name}: ${info.count} customer(s) — ${info.customers.slice(0,5).join(', ')}`);
}
