/**
 * Third-pass dedup: fetch all IDs in JS, compute keep set, delete the rest.
 * Avoids MySQL TiDB temp-table and subquery limitations.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

// Fetch all rows: id, extensivOrderId, configId, facilityId
const [rows] = await conn.execute(
  `SELECT id, extensivOrderId, configId, facilityId FROM order_tracking ORDER BY id ASC`
);
console.log(`Total rows fetched: ${rows.length}`);

// Build a map: key -> max id to keep
const keepMap = new Map();
for (const row of rows) {
  const key = `${row.extensivOrderId}|${row.configId}|${row.facilityId}`;
  // Always keep the highest id (last inserted)
  if (!keepMap.has(key) || row.id > keepMap.get(key)) {
    keepMap.set(key, row.id);
  }
}

// Collect IDs to delete
const keepIds = new Set(keepMap.values());
const deleteIds = rows.map(r => r.id).filter(id => !keepIds.has(id));
console.log(`Rows to keep: ${keepIds.size}, rows to delete: ${deleteIds.length}`);

if (deleteIds.length > 0) {
  // Delete in batches of 500
  let deleted = 0;
  for (let i = 0; i < deleteIds.length; i += 500) {
    const batch = deleteIds.slice(i, i + 500);
    const placeholders = batch.map(() => "?").join(",");
    const [result] = await conn.execute(
      `DELETE FROM order_tracking WHERE id IN (${placeholders})`,
      batch
    );
    deleted += result.affectedRows;
  }
  console.log(`Deleted ${deleted} duplicate rows`);
}

// Verify
const [[{ remaining }]] = await conn.execute(`
  SELECT COUNT(*) as remaining FROM (
    SELECT extensivOrderId, configId, facilityId
    FROM order_tracking
    GROUP BY extensivOrderId, configId, facilityId
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`Duplicate groups remaining: ${remaining}`);

if (remaining === 0) {
  try {
    await conn.execute(`
      ALTER TABLE order_tracking
      ADD UNIQUE INDEX uq_order_config_facility (extensivOrderId, configId, facilityId)
    `);
    console.log("Unique index added: uq_order_config_facility");
  } catch (e) {
    if (e.code === "ER_DUP_KEYNAME") {
      console.log("Unique index already exists — skipping");
    } else {
      console.error("Failed to add unique index:", e.message);
    }
  }
} else {
  console.error("Still have duplicates — unique index NOT added.");
}

await conn.end();
console.log("Done.");
