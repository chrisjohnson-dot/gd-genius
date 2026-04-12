import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Check hasAnyCarrierCredentials equivalent
const hasFedEx = !!(process.env.FEDEX_ONE_RATE_USER_KEY || process.env.FEDEX_USER_KEY);
const hasUPS = !!process.env.UPS_REST_TOKEN;
const hasUSPS = !!process.env.USPS_EHUB_API_KEY;
const hasOnTrac = !!(process.env.ONTRAC_ACCOUNT && process.env.ONTRAC_PASSWORD);
const hasDHL = !!(process.env.DHL_USER_KEY && process.env.DHL_PASSWORD);
const hasAny = hasFedEx || hasUPS || hasUSPS || hasOnTrac || hasDHL;

console.log("=== Carrier Credentials ===");
console.log({ hasFedEx, hasUPS, hasUSPS, hasOnTrac, hasDHL, hasAny });
console.log("FEDEX_ONE_RATE_USER_KEY:", process.env.FEDEX_ONE_RATE_USER_KEY?.slice(0,8) + "...", "len:", process.env.FEDEX_ONE_RATE_USER_KEY?.length);
console.log("FEDEX_ONE_RATE_PASSWORD:", process.env.FEDEX_ONE_RATE_PASSWORD?.slice(0,4) + "...", "len:", process.env.FEDEX_ONE_RATE_PASSWORD?.length);

// Check the most recent rate_wizard_shipments
console.log("\n=== Recent rate_wizard_shipments ===");
const [rows] = await db.execute("SELECT id, session_id, carrier_code, service_code, status, created_at FROM rate_wizard_shipments ORDER BY created_at DESC LIMIT 5");
console.log(rows);

// Check the most recent small_parcel_sessions
console.log("\n=== Recent small_parcel_sessions ===");
const [sessions] = await db.execute("SELECT id, reference_num, ship_to_zip, created_at FROM small_parcel_sessions ORDER BY created_at DESC LIMIT 5");
console.log(sessions);

await db.end();
