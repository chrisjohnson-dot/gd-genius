/**
 * Deduplication script for order_tracking table.
 * For each (extensivOrderId, configId, facilityId) group that has more than one row,
 * keep the row with the highest id (most recently inserted) and delete the rest.
 * Also adds a unique index to prevent future duplicates.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

// 1. Find duplicates
const [dupes] = await conn.execute(`
  SELECT extensivOrderId, configId, facilityId, COUNT(*) as cnt, MIN(id) as keep_id
  FROM order_tracking
  GROUP BY extensivOrderId, configId, facilityId
  HAVING cnt > 1
`);

console.log(`Found ${dupes.length} duplicate groups`);

let deleted = 0;
for (const row of dupes) {
  // Delete all rows in this group EXCEPT the one with the highest id
  const [result] = await conn.execute(
    `DELETE FROM order_tracking
     WHERE extensivOrderId = ? AND configId = ? AND facilityId = ?
       AND id != (
         SELECT id FROM (
           SELECT MAX(id) as id FROM order_tracking
           WHERE extensivOrderId = ? AND configId = ? AND facilityId = ?
         ) t
       )`,
    [row.extensivOrderId, row.configId, row.facilityId,
     row.extensivOrderId, row.configId, row.facilityId]
  );
  deleted += result.affectedRows;
  console.log(`  Cleaned extensivOrderId=${row.extensivOrderId} configId=${row.configId} facilityId=${row.facilityId}: deleted ${result.affectedRows} duplicates`);
}

console.log(`\nTotal rows deleted: ${deleted}`);

// 2. Add unique index to prevent future duplicates
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

await conn.end();
console.log("Done.");
