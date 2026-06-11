import { createConnection } from 'mysql2/promise';

const DB = 'mysql://4NCq8mAsshAuKGA.2865343ca485:9X0dm2uiL1goZL2EASv7@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/K5ogkLhSXtccCnqH4Vm3fs?ssl={"rejectUnauthorized":true}';
const conn = await createConnection(DB);
const TX_ID = 3470867;

// Local session
const [sessions] = await conn.query(
  `SELECT id, transactionId, customerName, status FROM qc_scan_sessions WHERE transactionId = ? ORDER BY id DESC LIMIT 1`,
  [TX_ID]
);
if (sessions.length) {
  const s = sessions[0];
  console.log(`Local session: ID=${s.id}, Status=${s.status}, Customer=${s.customerName}`);
  const [items] = await conn.query(
    `SELECT sku, expectedQty, scannedQty, caseAmount FROM qc_scan_items WHERE sessionId = ? ORDER BY sku`,
    [s.id]
  );
  console.log('Local scan items:');
  for (const i of items) {
    const pct = i.expectedQty > 0 ? Math.round(i.scannedQty / i.expectedQty * 100) : 0;
    console.log(`  ${i.sku}: ${i.scannedQty}/${i.expectedQty} (${pct}%) caseAmt=${i.caseAmount}`);
  }
} else {
  console.log('No local session found for TX', TX_ID);
}

// Extensiv
const [configs] = await conn.query(`SELECT clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE isActive = 1 LIMIT 1`);
const c = configs[0];
const base64Auth = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
const authBody = new URLSearchParams({ grant_type:'client_credentials', tpl:`{${c.tplGuid.replace(/[{}]/g,'')}}`, user_login_id:String(c.userLoginId) });
const authRes = await fetch(`${c.baseUrl}/AuthServer/api/Token`, {
  method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Authorization':`Basic ${base64Auth}`}, body:authBody.toString()
});
const {access_token:token} = await authRes.json();

const orderRes = await fetch(`${c.baseUrl}/orders/${TX_ID}?detail=orderitems`, {
  headers:{'Authorization':`Bearer ${token}`,'Accept':'application/json'}
});
const orderData = await orderRes.json();
const orderItems = orderData.OrderItems || orderData.orderItems || [];
const customer = orderData.CustomerIdentifier?.Name || 'Unknown';
const refNum = orderData.ReferenceNum || orderData.referenceNum || '—';
const poNum = orderData.PoNum || orderData.poNum || '—';
const shipTo = orderData.ShipTo?.CompanyName || orderData.shipTo?.companyName || '—';

console.log(`\nExtensiv order ${TX_ID}:`);
console.log(`  Customer: ${customer}`);
console.log(`  Reference: ${refNum}`);
console.log(`  PO: ${poNum}`);
console.log(`  Ship To: ${shipTo}`);
console.log(`  ${orderItems.length} line items:`);

let totalUnits = 0;
for (const item of orderItems) {
  const sku = item.ItemIdentifier?.Sku || item.itemIdentifier?.sku;
  const qty = Number(item.Qty ?? item.qty ?? 0);
  const caseQty = Number(item.ItemIdentifier?.CaseQty || item.itemIdentifier?.caseQty || 1);
  const desc = item.ItemIdentifier?.Description || item.itemIdentifier?.description || '';
  const fullCases = Math.floor(qty / caseQty);
  const singles = qty % caseQty;
  totalUnits += qty;
  console.log(`  SKU: ${sku} | Qty: ${qty} | Case: ${caseQty} | Full cases: ${fullCases} | Singles: ${singles} | Desc: ${desc}`);
}
console.log(`  Total units: ${totalUnits}`);

await conn.end();
