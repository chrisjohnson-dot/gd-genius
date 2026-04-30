/**
 * Fetch raw item data for a SKU from Extensiv and dump the full options/packageUnit structure
 * to find the correct weight field name.
 * Usage: npx tsx scripts/check_item_weight.mts [SKU]
 */
import mysql from "mysql2/promise";

const targetSku = process.argv[2] ?? "110004";

async function main() {
  // Get the first active Extensiv config from DB
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [configs] = await conn.execute(
    "SELECT id, clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE isActive = 1 LIMIT 1"
  ) as any;
  await conn.end();

  if (!configs || configs.length === 0) {
    console.error("No active Extensiv config found");
    process.exit(1);
  }

  const cfg = configs[0];
  console.log("Using config:", { id: cfg.id, baseUrl: cfg.baseUrl });

  // Get OAuth2 token (same as client.ts)
  const base64Auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const tokenParams = new URLSearchParams();
  tokenParams.append("grant_type", "client_credentials");
  tokenParams.append("tpl", `{${cfg.tplGuid.replace(/[{}]/g, "")}}`);
  tokenParams.append("user_login_id", String(cfg.userLoginId));
  const tokenRes = await fetch(`${cfg.baseUrl}/AuthServer/api/Token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": `Basic ${base64Auth}`,
    },
    body: tokenParams.toString(),
  });
  const tokenData = await tokenRes.json() as any;
  const token = tokenData?.access_token ?? tokenData?.AccessToken;
  if (!token) {
    console.error("Failed to get token:", JSON.stringify(tokenData));
    process.exit(1);
  }
  console.log("Got token:", token.substring(0, 20) + "...");

  // First get the customer list to find the right customerId
  const custRes = await fetch(`${cfg.baseUrl}/customers?pgsiz=100`, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
  });
  const custData = await custRes.json() as any;
  const customers = custData?._embedded
    ? Object.values(custData._embedded).flat() as any[]
    : [];
  console.log(`Found ${customers.length} customers`);
  // Find Kindling customer
  const kindling = customers.find((c: any) =>
    (c.companyInfo?.companyName ?? c.name ?? "").toLowerCase().includes("kindling")
  ) ?? customers[0];
  const customerId = kindling?.readOnly?.customerId ?? kindling?.id;
  console.log("Using customer:", kindling?.companyInfo?.companyName ?? kindling?.name, "id:", customerId);

  // Fetch item by SKU
  const baseUrl = cfg.baseUrl;
  const itemUrl = `${baseUrl}/customers/${customerId}/items?sku=${encodeURIComponent(targetSku)}&pgsiz=5`;
  console.log("Fetching:", itemUrl);

  const itemRes = await fetch(itemUrl, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (!itemRes.ok) {
    console.error("Item fetch failed:", itemRes.status, await itemRes.text());
    process.exit(1);
  }

  const itemData = await itemRes.json() as any;
  // Find the embedded items
  const embedded = itemData?._embedded;
  const items = embedded
    ? Object.values(embedded).flat()
    : (Array.isArray(itemData) ? itemData : [itemData]);

  console.log(`\nFound ${items.length} item(s) for SKU ${targetSku}:`);
  for (const item of items as any[]) {
    console.log("\n=== ITEM ===");
    console.log("SKU:", item.sku);
    console.log("options keys:", Object.keys(item.options ?? {}));
    console.log("options.imperial:", JSON.stringify(item.options?.imperial, null, 2));
    console.log("options.packageUnit:", JSON.stringify(item.options?.packageUnit, null, 2));
    // Also dump any weight-related keys at top level
    const weightKeys = Object.entries(item).filter(([k]) =>
      k.toLowerCase().includes("weight") || k.toLowerCase().includes("lbs") || k.toLowerCase().includes("lb")
    );
    if (weightKeys.length > 0) console.log("Top-level weight fields:", weightKeys);
    // Dump full options for inspection
    console.log("\nFull options:", JSON.stringify(item.options, null, 2));
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
