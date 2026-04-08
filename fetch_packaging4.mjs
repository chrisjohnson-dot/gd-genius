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

async function getJson(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

const token = await getToken();
console.log('Authenticated ✓\n');

// Fetch all customers
let allCustomers = [];
let pgnum = 1;
while (true) {
  const data = await getJson(token, `/customers?pgsiz=100&pgnum=${pgnum}`);
  if (!data) break;
  const list = data.ResourceList ?? [];
  allCustomers = allCustomers.concat(list);
  if (allCustomers.length >= data.TotalResults || list.length === 0) break;
  pgnum++;
}

// Filter to active, non-vacant
const activeCustomers = allCustomers.filter(c =>
  !c.ReadOnly?.Deactivated &&
  !c.CompanyInfo?.CompanyName?.includes('VACANT') &&
  !c.CompanyInfo?.CompanyName?.includes('DEACTIVATE') &&
  !c.CompanyInfo?.CompanyName?.includes('Deactivat')
);
console.log(`Active customers: ${activeCustomers.length}\n`);

// For each customer, collect unique PackageUnit types and Pallet types
const results = [];

for (const cust of activeCustomers) {
  const custId = cust.ReadOnly?.CustomerId;
  const custName = cust.CompanyInfo?.CompanyName ?? `#${custId}`;
  
  // Fetch all items
  let allItems = [];
  let itemPg = 1;
  while (true) {
    const itemData = await getJson(token, `/customers/${custId}/items?pgsiz=200&pgnum=${itemPg}`);
    if (!itemData) break;
    const list = itemData.ResourceList ?? [];
    allItems = allItems.concat(list);
    if (allItems.length >= itemData.TotalResults || list.length === 0) break;
    itemPg++;
  }
  
  if (allItems.length === 0) continue;
  
  // Collect unique package unit types and pallet configs
  const packageUnits = new Map(); // unitName -> { unitId, dims, inventoryUnitsPerUnit, isPrepackaged }
  const palletTypes = new Map();  // palletName -> { palletId, dims, qty }
  const inventoryUnits = new Map(); // unitName -> count
  
  for (const item of allItems) {
    const opts = item.Options ?? {};
    
    // InventoryUnit
    const invUnit = opts.InventoryUnit?.UnitIdentifier;
    if (invUnit?.Name) {
      inventoryUnits.set(invUnit.Name, (inventoryUnits.get(invUnit.Name) ?? 0) + 1);
    }
    
    // PackageUnit
    const pkgUnit = opts.PackageUnit;
    if (pkgUnit?.UnitIdentifier?.Name) {
      const name = pkgUnit.UnitIdentifier.Name;
      if (!packageUnits.has(name)) {
        packageUnits.set(name, {
          unitId: pkgUnit.UnitIdentifier.Id,
          imperial: pkgUnit.Imperial,
          metric: pkgUnit.Metric,
          inventoryUnitsPerUnit: pkgUnit.InventoryUnitsPerUnit,
          isPrepackaged: pkgUnit.IsPrepackaged,
          count: 0,
        });
      }
      packageUnits.get(name).count++;
    }
    
    // Pallets
    const pallet = opts.Pallets;
    if (pallet?.TypeIdentifier?.Name) {
      const name = pallet.TypeIdentifier.Name;
      if (!palletTypes.has(name)) {
        palletTypes.set(name, {
          palletId: pallet.TypeIdentifier.Id,
          qty: pallet.Qty,
          imperial: pallet.Imperial,
          metric: pallet.Metric,
          count: 0,
        });
      }
      palletTypes.get(name).count++;
    }
  }
  
  results.push({
    custId,
    custName,
    totalItems: allItems.length,
    inventoryUnits: Object.fromEntries(inventoryUnits),
    packageUnits: Object.fromEntries(packageUnits),
    palletTypes: Object.fromEntries(palletTypes),
  });
  
  process.stdout.write(`  ${custName}: ${allItems.length} items, pkg units: [${Array.from(packageUnits.keys()).join(', ')}], pallets: [${Array.from(palletTypes.keys()).join(', ')}]\n`);
}

// Print summary
console.log('\n\n════════════════════════════════════════════════════════════');
console.log('PACKAGING OPTIONS PER CUSTOMER (from item configurations)');
console.log('════════════════════════════════════════════════════════════\n');

for (const r of results) {
  const pkgKeys = Object.keys(r.packageUnits);
  const palletKeys = Object.keys(r.palletTypes);
  if (pkgKeys.length === 0 && palletKeys.length === 0) continue;
  
  console.log(`\n── ${r.custName} (id=${r.custId}, ${r.totalItems} SKUs) ──`);
  
  if (Object.keys(r.inventoryUnits).length > 0) {
    console.log(`  Inventory Units: ${Object.entries(r.inventoryUnits).map(([k,v]) => `${k} (${v} SKUs)`).join(', ')}`);
  }
  
  if (pkgKeys.length > 0) {
    console.log(`  Package Units:`);
    for (const [name, info] of Object.entries(r.packageUnits)) {
      const imp = info.imperial;
      const dims = imp ? `${imp.Length}×${imp.Width}×${imp.Height} in` : '';
      console.log(`    • ${name} (id=${info.unitId}) — ${info.inventoryUnitsPerUnit ?? '?'} units/pkg${dims ? `, ${dims}` : ''}${info.isPrepackaged ? ' [prepackaged]' : ''} — ${info.count} SKUs`);
    }
  }
  
  if (palletKeys.length > 0) {
    console.log(`  Pallet Types:`);
    for (const [name, info] of Object.entries(r.palletTypes)) {
      const imp = info.imperial;
      const dims = imp ? `${imp.Length}×${imp.Width}×${imp.Height} in, ${imp.Weight} lb` : '';
      console.log(`    • ${name} (id=${info.palletId}) — ${info.qty ?? '?'} units/pallet${dims ? `, ${dims}` : ''} — ${info.count} SKUs`);
    }
  }
}

// Also print a cross-customer summary of all unique package unit types
console.log('\n\n════════════════════════════════════════════════════════════');
console.log('ALL UNIQUE PACKAGE UNIT TYPES ACROSS ALL CUSTOMERS');
console.log('════════════════════════════════════════════════════════════');
const allPkgUnits = new Map();
const allPalletTypes = new Map();
for (const r of results) {
  for (const [name, info] of Object.entries(r.packageUnits)) {
    if (!allPkgUnits.has(name)) allPkgUnits.set(name, { ...info, customers: [] });
    allPkgUnits.get(name).customers.push(r.custName);
  }
  for (const [name, info] of Object.entries(r.palletTypes)) {
    if (!allPalletTypes.has(name)) allPalletTypes.set(name, { ...info, customers: [] });
    allPalletTypes.get(name).customers.push(r.custName);
  }
}

console.log('\nPackage Unit Types:');
for (const [name, info] of allPkgUnits) {
  console.log(`  ${name} (id=${info.unitId}) — used by ${info.customers.length} customer(s)`);
}

console.log('\nPallet Types:');
for (const [name, info] of allPalletTypes) {
  const imp = info.imperial;
  const dims = imp ? `${imp.Length}×${imp.Width}×${imp.Height} in, ${imp.Weight} lb` : '';
  console.log(`  ${name} (id=${info.palletId})${dims ? ` — ${dims}` : ''} — used by ${info.customers.length} customer(s)`);
}
