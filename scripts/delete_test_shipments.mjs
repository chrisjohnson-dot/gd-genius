import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Count first
const [countRows] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM shipments WHERE customer_name = 'Test Client' OR order_number = 'REF-001'`
);
console.log("Test rows found:", countRows[0].cnt);

if (countRows[0].cnt > 0) {
  const [result] = await conn.execute(
    `DELETE FROM shipments WHERE customer_name = 'Test Client' OR order_number = 'REF-001'`
  );
  console.log("Deleted rows:", result.affectedRows);
} else {
  console.log("No test rows to delete.");
}

await conn.end();
process.exit(0);
