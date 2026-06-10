import { createConnection } from 'mysql2/promise';

const DB = 'mysql://4NCq8mAsshAuKGA.2865343ca485:9X0dm2uiL1goZL2EASv7@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/K5ogkLhSXtccCnqH4Vm3fs?ssl={"rejectUnauthorized":true}';
const conn = await createConnection(DB);

// Find the session
const [sessions] = await conn.query(
  `SELECT id, transactionId, customerName, status, customerId, warehouseId FROM qc_scan_sessions WHERE transactionId = ? ORDER BY id DESC LIMIT 1`,
  [3513284]
);
if (!sessions.length) { console.log('No session found for TX 3513284'); await conn.end(); process.exit(1); }
const session = sessions[0];
console.log('Session:', JSON.stringify(session));

// Check scan items
const [items] = await conn.query(
  `SELECT sku, expectedQty, scannedQty, caseAmount FROM qc_scan_items WHERE sessionId = ? ORDER BY sku`,
  [session.id]
);
console.log('\nScan items:');
for (const i of items) {
  const pct = i.expectedQty > 0 ? Math.round(i.scannedQty / i.expectedQty * 100) : 0;
  console.log(`  ${i.sku}: ${i.scannedQty}/${i.expectedQty} (${pct}%) caseAmt=${i.caseAmount}`);
}

// Now fetch from Extensiv to see what MU 198460 actually has
const [configs] = await conn.query(`SELECT id, clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE isActive = 1 LIMIT 1`);
const config = configs[0];
const base64Auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
const authBody = new URLSearchParams({
  grant_type: 'client_credentials',
  tpl: `{${config.tplGuid.replace(/[{}]/g, '')}}`,
  user_login_id: String(config.userLoginId),
});
const authRes = await fetch(`${config.baseUrl}/AuthServer/api/Token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'Authorization': `Basic ${base64Auth}` },
  body: authBody.toString(),
});
const { access_token: token } = await authRes.json();
console.log('\n✓ Extensiv auth token obtained');

// Fetch inventory for MU label 198460
const muUrl = `${config.baseUrl}/inventory/stockdetails?rql=muLabel==198460&pgsiz=50`;
const muRes = await fetch(muUrl, {
  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
});
const muData = await muRes.json();
const muRecords = muData.ResourceList || muData.resourceList || [];
console.log(`\nExtensiv MU 198460 — ${muRecords.length} inventory records:`);
for (const rec of muRecords) {
  const sku = rec.ItemIdentifier?.Sku || rec.itemIdentifier?.sku;
  const onHand = rec.OnHand ?? rec.onHand ?? 0;
  const available = rec.Available ?? rec.available ?? 0;
  const lot = rec.LotNumber || rec.lotNumber || '';
  console.log(`  SKU=${sku}, onHand=${onHand}, available=${available}, lot=${lot}`);
}

// Also check what the order says for GR-071414
const orderRes = await fetch(`${config.baseUrl}/orders/3513284?detail=orderitems`, {
  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
});
const orderData = await orderRes.json();
const orderItems = orderData.OrderItems || orderData.orderItems || [];
console.log(`\nExtensiv order 3513284 line items:`);
for (const item of orderItems) {
  const sku = item.ItemIdentifier?.Sku || item.itemIdentifier?.sku;
  const qty = item.Qty ?? item.qty ?? 0;
  console.log(`  SKU=${sku}, Qty=${qty}`);
}

await conn.end();
