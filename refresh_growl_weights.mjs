/**
 * Refresh Growl Products INC. weights from Extensiv.
 * Fetches the latest packageUnit.weightLbs and inventoryUnitsPerUnit for all Growl SKUs
 * and upserts them into sku_weight_overrides so pallet weight calculations use the latest data.
 */
import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const CONFIG_ID = 3;
const CUSTOMER_ID = 131; // Growl Products INC.

// Load Extensiv config from DB
const conn = await createConnection(url);
const [configs] = await conn.query("SELECT id, clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE id = ?", [CONFIG_ID]);
if (!configs.length) { console.error("No Extensiv config found"); process.exit(1); }
const cfg = configs[0];

// Get Extensiv token using Basic Auth + form-encoded body (matches server/extensiv/client.ts)
const base64Auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
const params = new URLSearchParams();
params.append("grant_type", "client_credentials");
params.append("tpl", `{${cfg.tplGuid.replace(/[{}]/g, "")}}`);
params.append("user_login_id", String(cfg.userLoginId));
const tokenRes = await fetch(`${cfg.baseUrl}/AuthServer/api/Token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "Authorization": `Basic ${base64Auth}`,
  },
  body: params.toString(),
});
const tokenData = await tokenRes.json();
const token = tokenData.access_token;
if (!token) { console.error("Failed to get token:", tokenData); process.exit(1); }
console.log("Got Extensiv token.");

// Fetch all items for Growl
let pgnum = 1;
const pgsiz = 100;
let allItems = [];
while (true) {
  const res = await fetch(`${cfg.baseUrl}/customers/${CUSTOMER_ID}/items?pgsiz=${pgsiz}&pgnum=${pgnum}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" },
  });
  const data = await res.json();
  const items = data?._embedded?.["http://api.3plCentral.com/rels/customers/item"] ?? [];
  allItems = allItems.concat(items);
  if (items.length < pgsiz) break;
  pgnum++;
}
console.log(`Fetched ${allItems.length} items from Extensiv for Growl.`);

// Debug: show what weight fields are available on the first few items
console.log('Sample item weight fields:');
for (const item of allItems.slice(0, 5)) {
  const pkg = item.options?.packageUnit;
  const imp = item.options?.imperial;
  console.log(' SKU:', item.sku,
    '| pkg.weightLbs:', pkg?.weightLbs,
    '| pkg.weight:', pkg?.weight,
    '| pkg.netWeight:', pkg?.netWeight,
    '| pkg.grossWeight:', pkg?.grossWeight,
    '| pkg.inventoryUnitsPerUnit:', pkg?.inventoryUnitsPerUnit,
    '| imperial.weight:', imp?.weight
  );
}

let inserted = 0, updated = 0, skipped = 0;
for (const item of allItems) {
  const sku = item.sku;
  if (!sku) continue;
  const pkg = item.options?.packageUnit;
  const cartonWeightLb = pkg?.weightLbs ?? pkg?.weight ?? pkg?.netWeight ?? pkg?.grossWeight ?? null;
  const unitsPerCarton = pkg?.inventoryUnitsPerUnit ?? pkg?.qty ?? null;
  if (!cartonWeightLb || cartonWeightLb <= 0) { skipped++; continue; }

  const [existing] = await conn.query(
    "SELECT id FROM sku_weight_overrides WHERE config_id = ? AND customer_id = ? AND sku = ?",
    [CONFIG_ID, CUSTOMER_ID, sku]
  );
  if (existing.length > 0) {
    await conn.query(
      "UPDATE sku_weight_overrides SET carton_weight_lb = ?, units_per_carton = ?, note = ?, updated_at = NOW() WHERE config_id = ? AND customer_id = ? AND sku = ?",
      [cartonWeightLb, unitsPerCarton, "Refreshed from Extensiv — packageUnit.weightLbs", CONFIG_ID, CUSTOMER_ID, sku]
    );
    updated++;
  } else {
    await conn.query(
      "INSERT INTO sku_weight_overrides (config_id, customer_id, sku, carton_weight_lb, units_per_carton, note) VALUES (?, ?, ?, ?, ?, ?)",
      [CONFIG_ID, CUSTOMER_ID, sku, cartonWeightLb, unitsPerCarton, "Refreshed from Extensiv — packageUnit.weightLbs"]
    );
    inserted++;
  }
}

console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Skipped (no weight): ${skipped}`);
await conn.end();
