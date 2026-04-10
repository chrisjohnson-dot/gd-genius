import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

async function upsertSetting(key, value) {
  await db.execute(
    `INSERT INTO small_parcel_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

await upsertSetting("printer_ip", "10.90.1.218");
await upsertSetting("printer_port", "9100");

const [rows] = await db.execute(
  "SELECT setting_key, setting_value FROM small_parcel_settings WHERE setting_key IN ('printer_ip', 'printer_port')"
);
console.log("Printer config in DB:", rows);

await db.end();
