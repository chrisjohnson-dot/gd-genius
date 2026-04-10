/**
 * Debug: inspect raw Extensiv items API response to find packaging field paths.
 * Run from project root: node debug-extensiv.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const axios = require("axios");

// Load env
const { config: dotenvConfig } = require("dotenv");
dotenvConfig({ path: ".env" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL missing"); process.exit(1); }

// Connect to DB
const mysql2 = require("mysql2/promise");
const url = new URL(DATABASE_URL);
const conn = await mysql2.createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

const [rows] = await conn.execute("SELECT * FROM extensiv_configs WHERE isActive = 1 LIMIT 1");
const cfg = rows[0];
if (!cfg) { console.error("No active Extensiv config"); process.exit(1); }
console.log("Config:", cfg.name, "| baseUrl:", cfg.baseUrl);

// Get token
const base64Auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
const baseUrl = cfg.baseUrl || "https://secure-wms.com";
const params = new URLSearchParams();
params.append("grant_type", "client_credentials");
params.append("tpl", `{${cfg.tplGuid.replace(/[{}]/g, "")}}`);
params.append("user_login_id", String(cfg.userLoginId));
const tokenRes = await axios.post(`${baseUrl}/AuthServer/api/Token`, params.toString(), {
  headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${base64Auth}` },
});
const token = tokenRes.data.access_token;
console.log("Token OK");

// Get a customer ID from the DB (from small_parcel_sessions)
const [sessRows] = await conn.execute(
  "SELECT clientId, clientName FROM small_parcel_sessions WHERE clientId IS NOT NULL GROUP BY clientId, clientName LIMIT 5"
);
console.log("Clients in sessions:", sessRows.map(r => `${r.clientId} (${r.clientName})`));
const clientId = sessRows[0]?.clientId;
if (!clientId) { console.error("No clientId found"); process.exit(1); }
console.log("\nInspecting items for clientId:", clientId, sessRows[0]?.clientName);

// Helper to print item structure
function printItem(item, label) {
  console.log(`${label} keys:`, Object.keys(item));
  console.log(`${label}.Sku:`, item.Sku, "|", item.Description);
  console.log(`${label}.Options:`, JSON.stringify(item.Options, null, 2));
  console.log(`${label}.UnitsOfMeasure:`, JSON.stringify(item.UnitsOfMeasure, null, 2));
  console.log(`${label}.PackageUnit:`, JSON.stringify(item.PackageUnit, null, 2));
  console.log(`${label}.Pallet:`, JSON.stringify(item.Pallet, null, 2));
}

// Test 1: plain JSON no extra params
console.log("\n=== plain JSON no extra params ===");
const r1 = await fetch(`${baseUrl}/customers/${clientId}/items?pgsiz=2&pgnum=1`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
console.log("HTTP", r1.status);
const d1 = await r1.json();
console.log("Top keys:", Object.keys(d1));
if (d1.ResourceList?.length) {
  printItem(d1.ResourceList[0], "Item[0]");
} else {
  console.log("Raw:", JSON.stringify(d1, null, 2).substring(0, 800));
}

// Test 2: HAL+JSON no extra params
console.log("\n=== HAL+JSON no extra params ===");
const r2 = await fetch(`${baseUrl}/customers/${clientId}/items?pgsiz=2&pgnum=1`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" },
});
console.log("HTTP", r2.status);
const d2 = await r2.json();
console.log("Top keys:", Object.keys(d2));
if (d2._embedded) {
  const embKeys = Object.keys(d2._embedded);
  console.log("_embedded keys:", embKeys);
  const items = d2._embedded[embKeys[0]] || [];
  console.log("Item count:", items.length);
  if (items[0]) printItem(items[0], "Item[0]");
} else if (d2.ResourceList?.length) {
  printItem(d2.ResourceList[0], "Item[0]");
} else {
  console.log("Raw:", JSON.stringify(d2, null, 2).substring(0, 800));
}

// Test 3: Try fetching a single item by ID to get full detail
const itemId = d1.ResourceList?.[0]?.id || d1.ResourceList?.[0]?.Id;
if (itemId) {
  console.log("\n=== Single item GET /customers/{id}/items/{itemId} ===");
  const r3 = await fetch(`${baseUrl}/customers/${clientId}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  console.log("HTTP", r3.status);
  const d3 = await r3.json();
  console.log("Keys:", Object.keys(d3));
  console.log("Options:", JSON.stringify(d3.Options, null, 2));
  console.log("UnitsOfMeasure:", JSON.stringify(d3.UnitsOfMeasure, null, 2));
  console.log("PackageUnit:", JSON.stringify(d3.PackageUnit, null, 2));
}

await conn.end();
