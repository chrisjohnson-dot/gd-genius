import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(url);

try {
  // Check if column already exists
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_NAME = 'location_configs' AND COLUMN_NAME = 'isActive'`
  );
  if (rows.length > 0) {
    console.log("Column isActive already exists on location_configs — skipping.");
  } else {
    await conn.execute(
      `ALTER TABLE location_configs ADD COLUMN isActive boolean NOT NULL DEFAULT true`
    );
    console.log("Added isActive column to location_configs.");
  }
} finally {
  await conn.end();
}
