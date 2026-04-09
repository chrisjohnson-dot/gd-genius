import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
try {
  const envPath = resolve(__dirname, "../.env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch (_) {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL found in environment");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const statements = [
  "ALTER TABLE `shipments` ADD COLUMN `clear_sight_push_status` ENUM('pending','sent','failed') NULL AFTER `notes`",
  "ALTER TABLE `shipments` ADD COLUMN `clear_sight_push_attempts` INT NOT NULL DEFAULT 0 AFTER `clear_sight_push_status`",
  "ALTER TABLE `shipments` ADD COLUMN `clear_sight_push_error` VARCHAR(512) NULL AFTER `clear_sight_push_attempts`",
  "ALTER TABLE `shipments` ADD COLUMN `clear_sight_last_pushed_at` TIMESTAMP NULL AFTER `clear_sight_push_error`",
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    const col = sql.match(/ADD COLUMN `([^`]+)`/)?.[1] ?? sql;
    console.log(`✓ Added column: ${col}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      const col = sql.match(/ADD COLUMN `([^`]+)`/)?.[1] ?? sql;
      console.log(`⚠ Column already exists (skipped): ${col}`);
    } else {
      console.error(`✗ Error: ${e.message}`);
      await conn.end();
      process.exit(1);
    }
  }
}

await conn.end();
console.log("Migration complete.");
