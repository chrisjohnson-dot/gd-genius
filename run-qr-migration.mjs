import { readFileSync } from "fs";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);
const sql = readFileSync("drizzle/migrations/0099_qr_scanning.sql", "utf8");
const stmts = sql.split(";").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("--"));
for (const stmt of stmts) {
  console.log("Running:", stmt.substring(0, 70));
  await conn.execute(stmt);
}
await conn.end();
console.log("Migration complete");
