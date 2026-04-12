import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT id, location_id, carrier_code, name, credentials FROM rate_wizard_carrier_accounts ORDER BY id");
console.log("Total accounts:", rows.length);
for (const r of rows) {
  let creds = {};
  try { creds = JSON.parse(r.credentials || "{}"); } catch {}
  const keys = Object.keys(creds);
  const hasValues = keys.filter(k => creds[k] && String(creds[k]).trim() !== "");
  console.log(`id=${r.id} loc=${r.location_id} carrier=${r.carrier_code} name="${r.name}" cred_keys=[${keys.join(",")}] has_values=[${hasValues.join(",")}]`);
}
await conn.end();
