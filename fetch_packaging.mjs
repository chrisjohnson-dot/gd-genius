import mysql from 'mysql2/promise';

// ── Config ──────────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE id=3');
const cfg = rows[0];
await conn.end();

const BASE = cfg.baseUrl;

// ── Auth ─────────────────────────────────────────────────────────────────────
async function getToken() {
  const creds = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${BASE}/AuthServer/api/Token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      tpl: `{${cfg.tplGuid}}`,
      user_login_id: String(cfg.userLoginId),
    }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getJson(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) { console.error(`  ${path} → ${res.status}: ${text.slice(0,150)}`); return null; }
  try { return JSON.parse(text); } catch { return null; }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const token = await getToken();
console.log('Authenticated ✓\n');

// Fetch all customers (paginated)
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
console.log(`Total customers: ${allCustomers.length}\n`);

// For each customer fetch packaging options
const results = [];

for (const cust of allCustomers) {
  const custId = cust.ReadOnly?.CustomerId ?? cust.readOnly?.customerId;
  const custName = cust.CompanyInfo?.CompanyName ?? cust.companyInfo?.companyName ?? `#${custId}`;
  if (!custId) continue;

  // Try packaging endpoint
  const pkgData = await getJson(token, `/customers/${custId}/packaging?pgsiz=200`);
  const pkgList = pkgData?.ResourceList ?? [];

  if (pkgList.length > 0) {
    results.push({ custId, custName, packages: pkgList });
    console.log(`✓ ${custName} (id=${custId}): ${pkgList.length} packaging option(s)`);
    for (const p of pkgList) {
      const name = p.Name ?? p.name ?? p.PackageName ?? p.packageName ?? '(unnamed)';
      const l = p.Length ?? p.length ?? '';
      const w = p.Width ?? p.width ?? '';
      const h = p.Height ?? p.height ?? '';
      const wt = p.Weight ?? p.weight ?? '';
      const dims = [l, w, h].filter(Boolean).join(' × ');
      console.log(`    - ${name}${dims ? ` [${dims} in]` : ''}${wt ? ` weight=${wt}lb` : ''}`);
    }
  } else {
    console.log(`  ${custName} (id=${custId}): no packaging`);
  }
}

// Summary
console.log('\n\n════════════════════════════════════════════');
console.log('CUSTOMERS WITH PACKAGING OPTIONS');
console.log('════════════════════════════════════════════');
const withPkg = results.filter(r => r.packages.length > 0);
if (withPkg.length === 0) {
  console.log('No customers have packaging options configured.');
} else {
  for (const r of withPkg) {
    console.log(`\n${r.custName} (id=${r.custId}) — ${r.packages.length} option(s):`);
    for (const p of r.packages) {
      const name = p.Name ?? p.name ?? p.PackageName ?? p.packageName ?? '(unnamed)';
      const l = p.Length ?? p.length ?? '';
      const w = p.Width ?? p.width ?? '';
      const h = p.Height ?? p.height ?? '';
      const wt = p.Weight ?? p.weight ?? '';
      const dims = [l, w, h].filter(Boolean).join(' × ');
      const pkgType = p.PackageType ?? p.packageType ?? '';
      console.log(`  • ${name}${pkgType ? ` [${pkgType}]` : ''}${dims ? ` — ${dims} in` : ''}${wt ? ` — ${wt} lb` : ''}`);
      // Print all keys for first package to understand structure
    }
  }
}

// Print raw JSON for first customer with packaging so we can see the full structure
if (withPkg.length > 0) {
  console.log('\n\nRAW FIRST PACKAGE OBJECT (for structure reference):');
  console.log(JSON.stringify(withPkg[0].packages[0], null, 2));
}
