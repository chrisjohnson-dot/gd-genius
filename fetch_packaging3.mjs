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
  const text = await res.text();
  if (!res.ok) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const token = await getToken();
console.log('Authenticated ✓\n');

// Fetch all customers (active, non-vacant)
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

// Filter to active, non-vacant customers
const activeCustomers = allCustomers.filter(c => 
  !c.ReadOnly?.Deactivated && 
  !c.CompanyInfo?.CompanyName?.includes('VACANT') &&
  !c.CompanyInfo?.CompanyName?.includes('DEACTIVATE')
);
console.log(`Active customers: ${activeCustomers.length} (of ${allCustomers.length} total)\n`);

// For each customer, fetch a few items and look at the Options and Qualifiers fields
// which in Extensiv often contain packaging/UOM info
const packagingResults = [];

for (const cust of activeCustomers) {
  const custId = cust.ReadOnly?.CustomerId;
  const custName = cust.CompanyInfo?.CompanyName ?? `#${custId}`;
  
  // Fetch items with full details
  const itemData = await getJson(token, `/customers/${custId}/items?pgsiz=200`);
  const items = itemData?.ResourceList ?? [];
  
  // Look for packaging-related fields in Options
  const pkgItems = [];
  for (const item of items) {
    const opts = item.Options ?? {};
    const quals = item.Qualifiers ?? {};
    
    // Collect any packaging-relevant fields
    const pkgInfo = {};
    
    // Common Extensiv packaging fields in Options
    if (opts.IsPackaged !== undefined) pkgInfo.isPackaged = opts.IsPackaged;
    if (opts.PackageType !== undefined) pkgInfo.packageType = opts.PackageType;
    if (opts.UnitsPerCase !== undefined) pkgInfo.unitsPerCase = opts.UnitsPerCase;
    if (opts.CasesPerPallet !== undefined) pkgInfo.casesPerPallet = opts.CasesPerPallet;
    if (opts.UnitOfMeasure !== undefined) pkgInfo.unitOfMeasure = opts.UnitOfMeasure;
    if (opts.WeightUnit !== undefined) pkgInfo.weightUnit = opts.WeightUnit;
    if (opts.Weight !== undefined) pkgInfo.weight = opts.Weight;
    if (opts.Length !== undefined) pkgInfo.length = opts.Length;
    if (opts.Width !== undefined) pkgInfo.width = opts.Width;
    if (opts.Height !== undefined) pkgInfo.height = opts.Height;
    
    // Also check Qualifiers
    for (const [k, v] of Object.entries(quals)) {
      if (k.toLowerCase().includes('pack') || k.toLowerCase().includes('box') || 
          k.toLowerCase().includes('case') || k.toLowerCase().includes('pallet') ||
          k.toLowerCase().includes('uom') || k.toLowerCase().includes('unit')) {
        pkgInfo[`qual_${k}`] = v;
      }
    }
    
    // Check all Options keys for anything packaging-related
    for (const [k, v] of Object.entries(opts)) {
      if (k.toLowerCase().includes('pack') || k.toLowerCase().includes('box') || 
          k.toLowerCase().includes('case') || k.toLowerCase().includes('pallet') ||
          k.toLowerCase().includes('uom') || k.toLowerCase().includes('unit') ||
          k.toLowerCase().includes('carton')) {
        pkgInfo[`opt_${k}`] = v;
      }
    }
    
    if (Object.keys(pkgInfo).length > 0) {
      pkgItems.push({ sku: item.Sku, description: item.Description, ...pkgInfo });
    }
  }
  
  if (pkgItems.length > 0) {
    packagingResults.push({ custId, custName, items: pkgItems });
    console.log(`✓ ${custName} (${custId}): ${pkgItems.length}/${items.length} items have packaging fields`);
  } else if (items.length > 0) {
    console.log(`  ${custName} (${custId}): ${items.length} items, no packaging fields found`);
    // Print Options keys of first item to understand structure
    if (items[0]?.Options) {
      const optKeys = Object.keys(items[0].Options);
      if (optKeys.length > 0) console.log(`    Options keys: ${optKeys.join(', ')}`);
    }
  }
}

// Print full Options of first item from first customer to understand the structure
console.log('\n\n── Full Options structure of first item from first active customer ──');
const firstCust = activeCustomers[0];
const firstCustId = firstCust?.ReadOnly?.CustomerId;
const firstItemData = await getJson(token, `/customers/${firstCustId}/items?pgsiz=1`);
if (firstItemData?.ResourceList?.[0]) {
  const item = firstItemData.ResourceList[0];
  console.log('SKU:', item.Sku);
  console.log('Options:', JSON.stringify(item.Options, null, 2));
  console.log('Qualifiers:', JSON.stringify(item.Qualifiers, null, 2));
}

// Summary
console.log('\n\n════════════════════════════════════════════');
console.log('CUSTOMERS WITH PACKAGING DATA IN ITEMS');
console.log('════════════════════════════════════════════');
if (packagingResults.length === 0) {
  console.log('No packaging data found in item Options/Qualifiers.');
  console.log('\nNote: Extensiv may store packaging info differently.');
  console.log('Checking order details for packaging fields...');
  
  // Try fetching a recent order to see if it has packaging fields
  const orderData = await getJson(token, `/orders?pgsiz=5&pgnum=1&detail=all`);
  if (orderData?.ResourceList?.[0]) {
    const order = orderData.ResourceList[0];
    console.log('\nOrder keys:', Object.keys(order).join(', '));
    const pkgFields = Object.entries(order).filter(([k]) => 
      k.toLowerCase().includes('pack') || k.toLowerCase().includes('box') || 
      k.toLowerCase().includes('carton')
    );
    if (pkgFields.length > 0) console.log('Order packaging fields:', JSON.stringify(Object.fromEntries(pkgFields), null, 2));
    
    // Check order items
    const orderItems = order.OrderItems ?? order.LineItems ?? [];
    if (orderItems.length > 0) {
      console.log('\nOrder item keys:', Object.keys(orderItems[0]).join(', '));
    }
  }
} else {
  for (const r of packagingResults) {
    console.log(`\n${r.custName} (${r.custId}):`);
    for (const item of r.items.slice(0, 5)) {
      console.log(`  SKU: ${item.sku} — ${JSON.stringify(item)}`);
    }
  }
}
