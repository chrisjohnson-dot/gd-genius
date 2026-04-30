import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.log("No DB connection"); process.exit(1); }

// First describe the tables to get actual column names
const desc1 = await db.execute(sql`DESCRIBE sync_state`);
console.log("sync_state columns:", JSON.stringify(Array.isArray(desc1[0]) ? desc1[0] : desc1, null, 2));

const desc2 = await db.execute(sql`DESCRIBE mu_labels`);
console.log("mu_labels columns:", JSON.stringify(Array.isArray(desc2[0]) ? desc2[0] : desc2, null, 2));

const r2 = await db.execute(sql`SELECT COUNT(*) as cnt FROM mu_labels WHERE receiver_item_id IS NOT NULL`);
console.log("mu_labels WITH receiver_item_id:", JSON.stringify(Array.isArray(r2[0]) ? r2[0] : r2));

const r3 = await db.execute(sql`SELECT COUNT(*) as cnt FROM mu_labels WHERE receiver_item_id IS NULL`);
console.log("mu_labels WITHOUT receiver_item_id (Excel-seeded):", JSON.stringify(Array.isArray(r3[0]) ? r3[0] : r3));

const r4 = await db.execute(sql`SELECT facility_id, COUNT(*) as cnt FROM mu_labels GROUP BY facility_id ORDER BY facility_id`);
console.log("mu_labels by facility:", JSON.stringify(Array.isArray(r4[0]) ? r4[0] : r4, null, 2));

process.exit(0);
