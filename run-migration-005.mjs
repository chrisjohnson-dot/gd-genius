import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const sql = readFileSync("./drizzle/005_returns_scan_station.sql", "utf8");
const statements = sql
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter((s) => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.slice(0, 80));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (already exists):", stmt.slice(0, 80));
    } else {
      throw e;
    }
  }
}
await conn.end();
console.log("Migration 005 complete");
