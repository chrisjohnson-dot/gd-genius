import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config({ path: join(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection(url);

// Add outboundLocation column if missing
try {
  await conn.execute(`ALTER TABLE order_tracking ADD COLUMN outboundLocation varchar(256) NULL AFTER shipReadyAt`);
  console.log("✓ outboundLocation column added");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") console.log("✓ outboundLocation already exists");
  else throw e;
}

// Add palletCount column if missing
try {
  await conn.execute(`ALTER TABLE order_tracking ADD COLUMN palletCount int NOT NULL DEFAULT 0 AFTER outboundLocation`);
  console.log("✓ palletCount column added");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") console.log("✓ palletCount already exists");
  else throw e;
}

await conn.end();
console.log("Migration complete.");
