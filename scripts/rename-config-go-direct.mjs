/**
 * Rename extensiv_configs id=3 from "GD Allocation" to "Go Direct".
 * Run with: node scripts/rename-config-go-direct.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show current state
const [before] = await conn.execute("SELECT id, name FROM extensiv_configs WHERE id = 3");
console.log("Before:", JSON.stringify(before));

// Rename
const [result] = await conn.execute(
  "UPDATE extensiv_configs SET name = 'Go Direct' WHERE id = 3 AND name = 'GD Allocation'"
);
console.log("Rows updated:", result.affectedRows);

// Show after state
const [after] = await conn.execute("SELECT id, name FROM extensiv_configs WHERE id = 3");
console.log("After:", JSON.stringify(after));

await conn.end();
