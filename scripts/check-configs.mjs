/**
 * Check extensiv_configs names to identify the "GD Allocation" entry.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT id, name FROM extensiv_configs ORDER BY id");
console.log("extensiv_configs:", JSON.stringify(rows, null, 2));
await conn.end();
