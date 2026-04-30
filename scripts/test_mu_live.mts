/**
 * Live test: call Extensiv /inventory endpoint with PalletIdentifier.namekey.name RQL
 * to see what the API actually returns for a known MU barcode.
 * 
 * Usage: npx tsx scripts/test_mu_live.mts <muBarcode>
 * Example: npx tsx scripts/test_mu_live.mts 199806
 */
import { getExtensivConfigs } from "../server/db.js";
import { getExtensivToken } from "../server/extensiv/client.js";

const muLabel = process.argv[2] ?? "199806";

async function main() {
  const configs = await getExtensivConfigs();
  const row = configs.find(c => c.isActive);
  if (!row) { console.error("No active Extensiv config found"); process.exit(1); }
  console.log(`Using config id=${row.id} clientId=${row.clientId} tplGuid=${row.tplGuid} userLoginId=${row.userLoginId}`);

  const token = await getExtensivToken({
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    tplGuid: row.tplGuid,
    userLoginId: row.userLoginId,
    baseUrl: row.baseUrl,
  });
  console.log(`Got token: ${token.substring(0, 20)}...`);

  const baseUrl = "https://secure-wms.com";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/hal+json",
    "Content-Type": "application/json",
  };

  // Test 1: /inventory with PalletIdentifier.namekey.name (exact old GD Scanner syntax)
  const variants = [
    { label: "1. /inventory PalletIdentifier.namekey.name (old app exact)", path: "/inventory", rql: `PalletIdentifier.namekey.name==${muLabel}` },
    { label: "2. /inventory PalletIdentifier.NameKey.Name (PascalCase)", path: "/inventory", rql: `PalletIdentifier.NameKey.Name==${muLabel}` },
    { label: "3. /inventory/stockdetails palletIdentifier.nameKey.name (camelCase)", path: "/inventory/stockdetails", rql: `palletIdentifier.nameKey.name==${muLabel}` },
    { label: "4. /inventory/stockdetails muLabel== (direct field)", path: "/inventory/stockdetails", rql: `muLabel==${muLabel}` },
    { label: "5. /inventory/stockdetails MuLabel== (PascalCase)", path: "/inventory/stockdetails", rql: `MuLabel==${muLabel}` },
  ];

  for (const v of variants) {
    try {
      const url = `${baseUrl}${v.path}?rql=${encodeURIComponent(v.rql)}&pgsiz=5&pgnum=1`;
      console.log(`\n--- ${v.label} ---`);
      console.log(`URL: ${url}`);
      const res = await fetch(url, { headers });
      const text = await res.text();
      if (!res.ok) {
        console.log(`HTTP ${res.status}: ${text.substring(0, 300)}`);
        continue;
      }
      const data = JSON.parse(text);
      const rl = data["ResourceList"] ?? data["resourceList"];
      const count = Array.isArray(rl) ? rl.length : 0;
      console.log(`HTTP ${res.status} — ResourceList count: ${count}`);
      if (count > 0) {
        console.log("First record keys:", Object.keys(rl[0] as object));
        console.log("First record (trimmed):", JSON.stringify(rl[0], null, 2).substring(0, 800));
      } else {
        // Show top-level keys to understand response shape
        console.log("Response top-level keys:", Object.keys(data));
        const emb = data["_embedded"];
        if (emb) console.log("_embedded keys:", Object.keys(emb as object));
      }
    } catch (e) {
      console.log(`Error: ${(e as Error).message}`);
    }
  }

  // Also try a sample inventory fetch (no RQL) to see what fields exist
  console.log("\n--- 6. Sample /inventory/stockdetails (first 2 records, no filter) ---");
  try {
    // Get customerId from the first config's associated customer (use a broad sample)
    const url = `${baseUrl}/inventory/stockdetails?pgsiz=2&pgnum=1`;
    console.log(`URL: ${url}`);
    const res = await fetch(url, { headers });
    const data = await res.json() as any;
    const rl = data["ResourceList"] ?? data["resourceList"];
    if (Array.isArray(rl) && rl.length > 0) {
      console.log("Field names on first record:", Object.keys(rl[0] as object));
      const palletId = (rl[0] as any)["palletIdentifier"] ?? (rl[0] as any)["PalletIdentifier"];
      console.log("palletIdentifier field:", JSON.stringify(palletId));
      const muLabelField = (rl[0] as any)["muLabel"] ?? (rl[0] as any)["MuLabel"] ?? (rl[0] as any)["MULabel"];
      console.log("muLabel field:", muLabelField);
    }
  } catch (e) {
    console.log(`Error: ${(e as Error).message}`);
  }

  // Check what the /inventory endpoint actually returns in _embedded.item
  console.log("\n--- 7. /inventory _embedded.item sample (first 2) ---");
  try {
    const url = `${baseUrl}/inventory?pgsiz=2&pgnum=1`;
    const res = await fetch(url, { headers });
    const data = await res.json() as any;
    const emb = data["_embedded"] ?? {};
    const items = emb["item"] ?? [];
    console.log(`HTTP ${res.status} — _embedded.item count: ${Array.isArray(items) ? items.length : 0}`);
    if (Array.isArray(items) && items.length > 0) {
      console.log("First item keys:", Object.keys(items[0] as object));
      console.log("First item:", JSON.stringify(items[0], null, 2).substring(0, 1000));
    }
  } catch (e) { console.log(`Error: ${(e as Error).message}`); }

  // Try movableunits endpoint
  console.log("\n--- 8. /inventory/movableunits endpoint ---");
  try {
    const url = `${baseUrl}/inventory/movableunits?pgsiz=5&pgnum=1`;
    console.log(`URL: ${url}`);
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`HTTP ${res.status}`);
    if (res.ok) {
      const data = JSON.parse(text);
      console.log("Keys:", Object.keys(data));
      const rl = data["ResourceList"] ?? data["resourceList"];
      const emb = data["_embedded"] ?? {};
      console.log("ResourceList count:", Array.isArray(rl) ? rl.length : 0);
      console.log("_embedded keys:", Object.keys(emb));
      if (Array.isArray(rl) && rl.length > 0) console.log("First:", JSON.stringify(rl[0], null, 2).substring(0, 500));
    } else { console.log(text.substring(0, 300)); }
  } catch (e) { console.log(`Error: ${(e as Error).message}`); }

  // Try movableunits with the specific barcode
  console.log(`\n--- 9. /inventory/movableunits?rql=name==${muLabel} ---`);
  try {
    const url = `${baseUrl}/inventory/movableunits?rql=name%3D%3D${encodeURIComponent(muLabel)}&pgsiz=5&pgnum=1`;
    console.log(`URL: ${url}`);
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`HTTP ${res.status}`);
    if (res.ok) {
      const data = JSON.parse(text);
      const rl = data["ResourceList"] ?? data["resourceList"];
      const emb = (data["_embedded"] ?? {}) as Record<string, unknown>;
      const embItems = Object.values(emb).find(v => Array.isArray(v)) as unknown[] | undefined;
      const count = Array.isArray(rl) ? rl.length : (embItems?.length ?? 0);
      console.log(`count: ${count}`);
      const firstItem = Array.isArray(rl) ? rl[0] : embItems?.[0];
      if (firstItem) console.log("First:", JSON.stringify(firstItem, null, 2).substring(0, 800));
    } else { console.log(text.substring(0, 300)); }
  } catch (e) { console.log(`Error: ${(e as Error).message}`); }

  // Try /inventory with no RQL to see what pallet names look like
  console.log("\n--- 10. /inventory sample — check palletIdentifier field ---");
  try {
    const url = `${baseUrl}/inventory?pgsiz=5&pgnum=1`;
    const res = await fetch(url, { headers });
    const data = await res.json() as any;
    const emb = data["_embedded"] ?? {};
    const items: any[] = emb["item"] ?? [];
    for (const item of items.slice(0, 3)) {
      const pallet = item["palletIdentifier"] ?? item["PalletIdentifier"];
      const mu = item["muLabel"] ?? item["MuLabel"] ?? item["MULabel"];
      console.log(`  palletIdentifier: ${JSON.stringify(pallet)}, muLabel: ${mu}`);
    }
  } catch (e) { console.log(`Error: ${(e as Error).message}`); }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
