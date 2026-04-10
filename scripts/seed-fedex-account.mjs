/**
 * Seed script: Insert FedEx carrier account with Go Direct America origin address.
 * Run with: node scripts/seed-fedex-account.mjs
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

// Check if a FedEx account already exists
const [existing] = await conn.execute(
  "SELECT id, name, origin_address1, origin_postal FROM rate_wizard_carrier_accounts WHERE carrier_code = 'fedex' LIMIT 5"
);
console.log("Existing FedEx accounts:", existing);

if (existing.length > 0) {
  // Update the first existing FedEx account with the correct origin address
  const id = existing[0].id;
  await conn.execute(
    `UPDATE rate_wizard_carrier_accounts SET
      origin_name = 'Go Direct America',
      origin_address1 = '5830 Saltzgaber Rd',
      origin_city = 'Groveport',
      origin_state = 'OH',
      origin_postal = '43125',
      origin_country = 'US',
      is_active = 1,
      updated_at = NOW()
    WHERE id = ?`,
    [id]
  );
  console.log(`✅ Updated FedEx account id=${id} with Go Direct origin address`);
} else {
  // Insert a new FedEx carrier account
  const [result] = await conn.execute(
    `INSERT INTO rate_wizard_carrier_accounts
      (name, location_id, country, carrier_code, credentials,
       origin_name, origin_address1, origin_city, origin_state, origin_postal, origin_country,
       is_active, created_at, updated_at)
    VALUES
      ('FedEx — Columbus', 'COL-Columbus', 'US', 'fedex', '{}',
       'Go Direct America', '5830 Saltzgaber Rd', 'Groveport', 'OH', '43125', 'US',
       1, NOW(), NOW())`
  );
  console.log(`✅ Inserted new FedEx carrier account id=${result.insertId}`);
}

// Verify
const [rows] = await conn.execute(
  "SELECT id, name, carrier_code, origin_name, origin_address1, origin_city, origin_state, origin_postal, is_active FROM rate_wizard_carrier_accounts WHERE carrier_code = 'fedex'"
);
console.log("FedEx accounts after update:", rows);

await conn.end();
