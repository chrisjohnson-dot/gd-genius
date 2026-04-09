import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const sql = readFileSync("./drizzle/0053_unified_shipments.sql", "utf8");

// Extract just the CREATE TABLE statement (skip comments)
const lines = sql.split("\n").filter(l => !l.trim().startsWith("--") && l.trim().length > 0);
const createSql = lines.join("\n").split(";")[0].trim();

try {
  await conn.execute(createSql);
  console.log("✅ Migration 0053 applied: shipments table created");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("ℹ️  Table already exists — skipping");
  } else {
    console.error("❌ Migration error:", err.message);
    process.exit(1);
  }
}

await conn.end();
