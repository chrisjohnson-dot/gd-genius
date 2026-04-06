import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load DATABASE_URL from .env if present
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  try {
    const env = readFileSync(resolve(__dirname, ".env"), "utf8");
    const match = env.match(/DATABASE_URL=(.+)/);
    if (match) dbUrl = match[1].trim();
  } catch {}
}
if (!dbUrl) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(dbUrl);
try {
  await conn.execute(
    'ALTER TABLE client_visibility ADD COLUMN IF NOT EXISTS orderChannel ENUM("b2b","d2c","both") NOT NULL DEFAULT "both"'
  );
  console.log("✓ orderChannel column added to client_visibility");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("✓ orderChannel column already exists");
  } else {
    throw e;
  }
} finally {
  await conn.end();
}
