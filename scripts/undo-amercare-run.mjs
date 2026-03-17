/**
 * One-shot script: undo Amercare run 30003
 * - Deallocates order 3207858 in Extensiv
 * - Reverses all to_staging pull list moves back to their source locations
 * - Marks the run as cancelled in the DB
 *
 * Run with: node scripts/undo-amercare-run.mjs
 */
import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_URL = process.env.DATABASE_URL;
const RUN_ID = 30003;
const RUN_ORDER_ID = 30007;
const ORDER_ID = "3207858";

// ── helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(config) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "3PL-Warehouse-Id": String(config.warehouseId ?? ""),
    "3PL-Customer-Id": String(config.customerId ?? ""),
  };
}

async function fetchOrderEtag(config, orderId) {
  const url = `${config.baseUrl}/orders/${orderId}?detail=all`;
  const res = await fetch(url, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`fetchOrder ${orderId}: ${res.status} ${await res.text()}`);
  const etag = res.headers.get("etag") ?? res.headers.get("ETag");
  return etag;
}

async function deallocate(config, orderId, etag) {
  const url = `${config.baseUrl}/orders/${orderId}/deallocate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...buildHeaders(config), "If-Match": etag },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function moveInventory(config, toLocationId, toLocationName, items) {
  const url = `${config.baseUrl}/inventory/mover`;
  const payload = {
    locationId: toLocationId,
    locationName: toLocationName,
    items: items.map((i) => ({ receiveItemId: i.receiveItemId, quantity: i.qty })),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!DB_URL) throw new Error("DATABASE_URL not set");

  const url = new URL(DB_URL);
  const conn = await createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Load config
    const [cfgRows] = await conn.execute("SELECT * FROM extensiv_configs WHERE id = 3");
    const config = cfgRows[0];
    if (!config) throw new Error("Extensiv config id=3 not found");
    console.log(`Using config: ${config.name}  baseUrl: ${config.baseUrl}`);

    // 1. Fetch ETag
    console.log(`\n[1] Fetching ETag for order ${ORDER_ID}...`);
    let etag;
    try {
      etag = await fetchOrderEtag(config, ORDER_ID);
      console.log(`    ETag: ${etag}`);
    } catch (err) {
      console.warn(`    Could not fetch ETag: ${err.message}`);
      console.warn("    Skipping Extensiv deallocate — will still reverse inventory moves");
      etag = null;
    }

    // 2. Deallocate in Extensiv (only if we have an ETag)
    if (etag) {
      console.log(`\n[2] Deallocating order ${ORDER_ID} in Extensiv...`);
      const deallocResult = await deallocate(config, ORDER_ID, etag);
      console.log(`    Status: ${deallocResult.status}`);
      console.log(`    Body: ${deallocResult.body.slice(0, 400)}`);
      if (!deallocResult.ok) {
        console.warn("    WARNING: Deallocate returned non-OK — continuing with inventory reversal anyway");
      }
    }

    // 3. Load pull list
    const [[runRow]] = await conn.execute("SELECT pullList FROM allocation_runs WHERE id = ?", [RUN_ID]);
    const pullList = typeof runRow.pullList === "string" ? JSON.parse(runRow.pullList) : runRow.pullList;
    const stagingMoves = pullList.filter((e) => e.movement === "to_staging");
    console.log(`\n[3] Pull list: ${pullList.length} total entries, ${stagingMoves.length} to_staging moves to reverse`);

    // Group by fromLocation (original source)
    const bySource = new Map();
    for (const entry of stagingMoves) {
      const key = entry.fromLocationId;
      if (!bySource.has(key)) {
        bySource.set(key, { locationId: entry.fromLocationId, locationName: entry.fromLocationName, items: [] });
      }
      bySource.get(key).items.push({ receiveItemId: entry.receiveItemId, qty: entry.qty });
    }
    console.log(`    Grouped into ${bySource.size} source location(s)`);

    // 4. Reverse each group
    let successCount = 0;
    let failCount = 0;
    for (const { locationId, locationName, items } of bySource.values()) {
      const totalQty = items.reduce((s, i) => s + i.qty, 0);
      console.log(`\n[4] Returning ${totalQty} unit(s) across ${items.length} receive item(s) → ${locationName} (id=${locationId})`);
      const result = await moveInventory(config, locationId, locationName, items);
      if (result.ok) {
        console.log(`    ✓ Success`);
        successCount++;
      } else {
        console.warn(`    ✗ Failed: ${result.status} — ${result.body.slice(0, 300)}`);
        failCount++;
      }
    }

    // 5. Update DB
    console.log(`\n[5] Updating database...`);
    await conn.execute(
      "UPDATE allocation_run_orders SET status = 'unallocated' WHERE id = ?",
      [RUN_ORDER_ID]
    );
    await conn.execute(
      "UPDATE allocation_runs SET status = 'cancelled', allocatedCount = 0 WHERE id = ?",
      [RUN_ID]
    );
    console.log(`    ✓ Run ${RUN_ID} → cancelled`);
    console.log(`    ✓ Run order ${RUN_ORDER_ID} → unallocated`);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ Complete!  Inventory reversal: ${successCount} location(s) succeeded, ${failCount} failed`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
