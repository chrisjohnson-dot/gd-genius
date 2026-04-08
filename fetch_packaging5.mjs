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

// Fetch all customers (pgnum starts at 1)
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
console.log(`Active customers: ${activeCustomers.length} (of ${allCustomers.length} total)\n`);

// For each customer, collect unique PackageUnit types and Pallet types from items
const results = [];

for (const cust of activeCustomers) {
  const custId = cust.ReadOnly?.CustomerId;
  const custName = cust.CompanyInfo?.CompanyName ?? `#${custId}`;
  
  // Fetch first page of items to get TotalResults, then paginate
  const firstPage = await getJson(token, `/customers/${custId}/items?pgsiz=200&pgnum=1`);
  if (!firstPage) continue;
  
  let allItems = firstPage.ResourceList ?? [];
  const total = firstPage.TotalResults ?? 0;
  
  // Fetch remaining pages
  let pg = 2;
  while (allItems.length < total) {
    const page = await getJson(token, `/customers/${custId}/items?pgsiz=200&pgnum=${pg}`);
    if (!page || (page.ResourceList ?? []).length === 0) break;
    allItems = allItems.concat(page.ResourceList);
    pg++;
  }
  
  if (allItems.length === 0) continue;
  
  // Collect unique package unit types and pallet configs
  const packageUnits = new Map();
  const palletTypes = new Map();
  const inventoryUnits = new Map();
  
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
          inventoryUnitsPerUnit: pkgUnit.InventoryUnitsPerUnit,
          isPrepackaged: pkgUnit.IsPrepackaged,
          count: 0,
          exampleSkus: [],
        });
      }
      const entry = packageUnits.get(name);
      entry.count++;
      if (entry.exampleSkus.length < 3) entry.exampleSkus.push(item.Sku);
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
  
  const pkgSummary = Array.from(packageUnits.keys()).join(', ') || 'none';
  const palletSummary = Array.from(palletTypes.keys()).join(', ') || 'none';
  process.stdout.write(`  ${custName} (${custId}): ${allItems.length} SKUs | pkg: [${pkgSummary}] | pallets: [${palletSummary}]\n`);
}

// Print detailed summary
console.log('\n\n════════════════════════════════════════════════════════════');
console.log('PACKAGING CONFIGURATION PER CUSTOMER');
console.log('════════════════════════════════════════════════════════════\n');

for (const r of results) {
  const pkgKeys = Object.keys(r.packageUnits);
  const palletKeys = Object.keys(r.palletTypes);
  
  console.log(`\n── ${r.custName} (id=${r.custId}) — ${r.totalItems} SKUs ──`);
  
  // Inventory Units
  const invEntries = Object.entries(r.inventoryUnits);
  if (invEntries.length > 0) {
    console.log(`  Inventory Unit(s): ${invEntries.map(([k,v]) => `${k} (${v} SKUs)`).join(' | ')}`);
  }
  
  // Package Units
  if (pkgKeys.length > 0) {
    console.log(`  Package Unit(s):`);
    for (const [name, info] of Object.entries(r.packageUnits)) {
      const imp = info.imperial;
      const dims = imp && (imp.Length || imp.Width || imp.Height)
        ? `${imp.Length}×${imp.Width}×${imp.Height} in${imp.Weight ? `, ${imp.Weight} lb` : ''}`
        : '';
      const unitsPerPkg = info.inventoryUnitsPerUnit != null ? `${info.inventoryUnitsPerUnit} units/pkg` : '';
      console.log(`    • ${name} (id=${info.unitId})${unitsPerPkg ? ` — ${unitsPerPkg}` : ''}${dims ? ` — ${dims}` : ''}${info.isPrepackaged ? ' [prepackaged]' : ''} — ${info.count} SKUs`);
    }
  } else {
    console.log(`  Package Units: (none configured)`);
  }
  
  // Pallet Types
  if (palletKeys.length > 0) {
    console.log(`  Pallet Type(s):`);
    for (const [name, info] of Object.entries(r.palletTypes)) {
      const imp = info.imperial;
      const dims = imp && (imp.Length || imp.Width || imp.Height)
        ? `${imp.Length}×${imp.Width}×${imp.Height} in${imp.Weight ? `, ${imp.Weight} lb` : ''}`
        : '';
      console.log(`    • ${name} (id=${info.palletId})${info.qty ? ` — ${info.qty} units/pallet` : ''}${dims ? ` — ${dims}` : ''} — ${info.count} SKUs`);
    }
  }
}

// Cross-customer summary
console.log('\n\n════════════════════════════════════════════════════════════');
console.log('CROSS-CUSTOMER SUMMARY');
console.log('════════════════════════════════════════════════════════════\n');

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

console.log('Package Unit Types (unique across all customers):');
if (allPkgUnits.size === 0) {
  console.log('  (none found)');
} else {
  for (const [name, info] of allPkgUnits) {
    console.log(`  • ${name} (id=${info.unitId}) — ${info.customers.length} customer(s): ${info.customers.slice(0,5).join(', ')}${info.customers.length > 5 ? '...' : ''}`);
  }
}

console.log('\nPallet Types (unique across all customers):');
if (allPalletTypes.size === 0) {
  console.log('  (none found)');
} else {
  for (const [name, info] of allPalletTypes) {
    const imp = info.imperial;
    const dims = imp && (imp.Length || imp.Width || imp.Height)
      ? `${imp.Length}×${imp.Width}×${imp.Height} in${imp.Weight ? `, ${imp.Weight} lb` : ''}`
      : '';
    console.log(`  • ${name} (id=${info.palletId})${dims ? ` — ${dims}` : ''}${info.qty ? ` — ${info.qty} units/pallet` : ''} — ${info.customers.length} customer(s)`);
  }
}
