/**
 * Second-pass dedup using a temp-table approach that avoids MySQL's
 * "can't specify target table in FROM clause" limitation.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

// Check how many duplicate groups remain
const [[{ cnt }]] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT extensivOrderId, configId, facilityId
    FROM order_tracking
    GROUP BY extensivOrderId, configId, facilityId
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`Remaining duplicate groups: ${cnt}`);

if (cnt > 0) {
  // Create a temp table of IDs to keep (MAX id per group)
  await conn.execute(`DROP TEMPORARY TABLE IF EXISTS _keep_ids`);
  await conn.execute(`
    CREATE TEMPORARY TABLE _keep_ids AS
    SELECT MAX(id) as keep_id
    FROM order_tracking
    GROUP BY extensivOrderId, configId, facilityId
  `);

  // Delete all rows NOT in the keep set
  const [result] = await conn.execute(`
    DELETE FROM order_tracking
    WHERE id NOT IN (SELECT keep_id FROM _keep_ids)
  `);
  console.log(`Deleted ${result.affectedRows} additional duplicate rows`);

  await conn.execute(`DROP TEMPORARY TABLE IF EXISTS _keep_ids`);
}

// Verify no duplicates remain
const [[{ remaining }]] = await conn.execute(`
  SELECT COUNT(*) as remaining FROM (
    SELECT extensivOrderId, configId, facilityId
    FROM order_tracking
    GROUP BY extensivOrderId, configId, facilityId
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`Duplicate groups remaining after cleanup: ${remaining}`);

if (remaining === 0) {
  // Now safe to add unique index
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
  console.error("Still have duplicates — unique index NOT added. Check data manually.");
}

await conn.end();
console.log("Done.");
