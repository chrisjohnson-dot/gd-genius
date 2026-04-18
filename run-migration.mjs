import mysql from "mysql2/promise";
import fs from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const sql = fs.readFileSync("drizzle/0047_chilly_magdalene.sql", "utf8");

// Split on semicolons; strip leading comment lines, keep only real SQL
const stmts = sql
  .split(";")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter((s) => s.length > 0);

for (const stmt of stmts) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.slice(0, 80));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("SKIP (already exists):", stmt.slice(0, 80));
    } else {
      console.error("FAILED:", e.message);
      await conn.end();
      process.exit(1);
    }
  }
}

await conn.end();
console.log("Migration complete");
