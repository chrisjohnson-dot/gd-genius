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

async function tryEndpoint(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text: text.slice(0, 300) };
}

const token = await getToken();
console.log('Authenticated ✓\n');

// Get a few active customers to test with
const custRes = await fetch(`${BASE}/customers?pgsiz=20&pgnum=1`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const custData = await custRes.json();
const activeCusts = (custData.ResourceList ?? [])
  .filter(c => !c.ReadOnly?.Deactivated && !c.CompanyInfo?.CompanyName?.includes('VACANT') && !c.CompanyInfo?.CompanyName?.includes('Deactivat'))
  .slice(0, 5);

console.log('Test customers:', activeCusts.map(c => `${c.CompanyInfo?.CompanyName} (${c.ReadOnly?.CustomerId})`).join(', '));
console.log();

// Try various packaging-related endpoints
const testCustId = activeCusts[0]?.ReadOnly?.CustomerId;
const endpointsToTry = [
  `/customers/${testCustId}/packaging`,
  `/customers/${testCustId}/packagingtypes`,
  `/customers/${testCustId}/packagetypes`,
  `/customers/${testCustId}/boxes`,
  `/customers/${testCustId}/cartonTypes`,
  `/customers/${testCustId}/cartontypes`,
  `/customers/${testCustId}/items?pgsiz=5`,  // check item structure for packaging fields
  `/packagingtypes?pgsiz=50`,
  `/packagetypes?pgsiz=50`,
  `/cartonTypes?pgsiz=50`,
  `/cartontypes?pgsiz=50`,
  `/packaging?pgsiz=50`,
  `/customers/${testCustId}/itempackaging`,
  `/customers/${testCustId}/itemPackaging`,
];

for (const ep of endpointsToTry) {
  const r = await tryEndpoint(token, ep);
  const summary = r.status === 200
    ? `✓ ${r.status} — ${r.data?.TotalResults ?? r.data?.ResourceList?.length ?? 'ok'} results`
    : `✗ ${r.status}`;
  console.log(`${ep}\n  → ${summary}`);
  if (r.status === 200 && r.data?.ResourceList?.length > 0) {
    console.log('  Keys:', Object.keys(r.data.ResourceList[0]).join(', '));
    console.log('  First:', JSON.stringify(r.data.ResourceList[0]).slice(0, 200));
  }
  console.log();
}

// Also check item details for packaging fields
console.log('\n── Checking item structure for packaging fields ──');
const itemRes = await tryEndpoint(token, `/customers/${testCustId}/items?pgsiz=3`);
if (itemRes.status === 200 && itemRes.data?.ResourceList?.length > 0) {
  const item = itemRes.data.ResourceList[0];
  console.log('Item keys:', Object.keys(item).join(', '));
  // Look for packaging-related fields
  const pkgFields = Object.entries(item).filter(([k]) => 
    k.toLowerCase().includes('pack') || k.toLowerCase().includes('box') || 
    k.toLowerCase().includes('carton') || k.toLowerCase().includes('ship')
  );
  if (pkgFields.length > 0) {
    console.log('Packaging-related fields:', JSON.stringify(Object.fromEntries(pkgFields), null, 2));
  }
}
