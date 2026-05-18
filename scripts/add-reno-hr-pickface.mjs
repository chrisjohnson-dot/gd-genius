/**
 * One-time script: fetch all HR### locations from Extensiv RENO (facilityId=3, configId=3)
 * and insert them as pick_face entries in location_configs for BOBA, ONCO, and KGP.
 *
 * Run from project root: node scripts/add-reno-hr-pickface.mjs
 */

import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
try {
  const envPath = join(__dirname, "..", ".env");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // .env may not exist; rely on injected env
}

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG_ID   = 3;
const FACILITY_ID = 3;
const FACILITY_NAME = "RENO - Reno";

const CUSTOMERS = [
  { customerId: 191, customerName: "BOBA" },
  { customerId: 192, customerName: "KGP"  },
  { customerId: 190, customerName: "ONCO" },
];

// HR locations: names matching HR followed by 1-3 digits (HR1 – HR400)
const HR_PATTERN = /^HR\d{1,3}$/i;

// ── Fetch Extensiv OAuth token ────────────────────────────────────────────────
async function getToken(cfg) {
  const baseUrl = cfg.baseUrl || 'https://secure-wms.com';
  const tokenUrl = `${baseUrl}/AuthServer/api/Token`;
  const base64Auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const tplGuid = cfg.tplGuid.replace(/[{}]/g, '');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('tpl', `{${tplGuid}}`);
  params.append('user_login_id', String(cfg.userLoginId));
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${base64Auth}`,
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ── Fetch Extensiv locations ──────────────────────────────────────────────────
async function fetchExtensivLocations(cfg, facilityId) {
  const token = await getToken(cfg);
  const baseUrl = cfg.baseUrl || 'https://api.3plCentral.com';
  const allLocations = [];
  let pgnum = 1;
  const pgsiz = 500;

  while (true) {
    const url = `${baseUrl}/properties/facilities/${facilityId}/locations?pgsiz=${pgsiz}&pgnum=${pgnum}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        '3PL-Guid': cfg.tplGuid,
        'UserLoginId': String(cfg.userLoginId),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Extensiv API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const items = data?._embedded?.["http://api.3plCentral.com/rels/properties/location"] ?? [];

    for (const item of items) {
      const id   = item.locationId ?? item.id;
      const name = item.field1 ?? item.name ?? item.nameKey?.name ?? "";
      const fId  = item.facilityIdentifier?.id ?? facilityId;
      if (id && name && fId === facilityId) {
        allLocations.push({ locationId: id, name });
      }
    }

    console.log(`  Page ${pgnum}: ${items.length} items (total so far: ${allLocations.length})`);
    if (items.length < pgsiz) break;
    pgnum++;
  }

  return allLocations;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const db = await createConnection(process.env.DATABASE_URL);

  // Get Extensiv API credentials for configId=3
  const [cfgRows] = await db.execute(
    "SELECT id, name, clientId, clientSecret, tplGuid, userLoginId, baseUrl FROM extensiv_configs WHERE id = ?",
    [CONFIG_ID]
  );
  if (!cfgRows.length) throw new Error(`No extensiv_config found for id=${CONFIG_ID}`);
  const cfg = cfgRows[0];
  console.log(`Using Extensiv config id=${cfg.id}, name=${cfg.name}, baseUrl=${cfg.baseUrl}`);

  // Fetch all locations for RENO from Extensiv
  console.log(`\nFetching locations for facilityId=${FACILITY_ID} from Extensiv...`);
  const allLocations = await fetchExtensivLocations(cfg, FACILITY_ID);
  console.log(`Total locations fetched: ${allLocations.length}`);

  // Filter to HR001–HR400
  const hrLocations = allLocations.filter(l => HR_PATTERN.test(l.name.trim()));
  console.log(`\nHR### locations found: ${hrLocations.length}`);
  hrLocations.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const l of hrLocations) {
    console.log(`  ${l.name} (locationId=${l.locationId})`);
  }

  if (hrLocations.length === 0) {
    console.log("\nNo HR locations found — nothing to insert. Exiting.");
    await db.end();
    return;
  }

  // Check which (configId, customerId, locationId) combos already exist
  const [existing] = await db.execute(
    "SELECT customerId, locationId FROM location_configs WHERE configId = ? AND facilityId = ? AND locationType = 'pick_face'",
    [CONFIG_ID, FACILITY_ID]
  );
  const existingSet = new Set(existing.map(r => `${r.customerId}:${r.locationId}`));
  console.log(`\nExisting pick_face entries for RENO: ${existing.length}`);

  // Build insert rows
  const rows = [];
  for (const customer of CUSTOMERS) {
    for (const loc of hrLocations) {
      const key = `${customer.customerId}:${loc.locationId}`;
      if (!existingSet.has(key)) {
        rows.push([
          CONFIG_ID,
          customer.customerId,
          customer.customerName,
          FACILITY_ID,
          FACILITY_NAME,
          loc.locationId,
          loc.name,
          "pick_face",
          true,
        ]);
      }
    }
  }

  console.log(`\nRows to insert: ${rows.length} (${hrLocations.length} locations × ${CUSTOMERS.length} customers, minus ${existing.length} already existing)`);

  if (rows.length === 0) {
    console.log("All HR pick face locations already configured. Nothing to do.");
    await db.end();
    return;
  }

  // Batch insert
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db.query(
      `INSERT INTO location_configs (configId, customerId, customerName, facilityId, facilityName, locationId, locationName, locationType, isActive)
       VALUES ${batch.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}`,
      batch.flat()
    );
    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${rows.length}\r`);
  }

  console.log(`\n\nDone! Inserted ${inserted} pick_face location_config rows for RENO HR### locations.`);
  await db.end();
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
