import { createConnection } from "mysql2/promise";
const db = await createConnection(process.env.DATABASE_URL);
const [rows] = await db.execute("SHOW COLUMNS FROM customer_shipping_rules LIKE 'default_freight_class'");
if (rows.length > 0) {
  console.log("Column already exists — skipping");
} else {
  await db.execute("ALTER TABLE customer_shipping_rules ADD COLUMN default_freight_class VARCHAR(10) NULL");
  console.log("Migration applied successfully");
}
await db.end();
