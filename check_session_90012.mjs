import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Check session 90012
const [sessions] = await db.execute("SELECT id, extensiv_order_id, reference_num, ship_to_zip, status FROM small_parcel_sessions WHERE id = 90012");
console.log("=== Session 90012 ===");
console.log(sessions);

// Check the most recent session
const [latestSessions] = await db.execute("SELECT id, extensiv_order_id, reference_num, ship_to_zip, status FROM small_parcel_sessions ORDER BY created_at DESC LIMIT 3");
console.log("\n=== Latest 3 sessions ===");
console.log(latestSessions);

// Check rate_wizard_shipments for session 90012
const [shipments] = await db.execute("SELECT id, session_id, order_id, carrier_code, service_code, status FROM rate_wizard_shipments WHERE session_id = 90012");
console.log("\n=== rate_wizard_shipments for session 90012 ===");
console.log(shipments);

// Check if there are any rate_wizard_shipments for the extensiv_order_id of session 90012
if (sessions.length > 0 && sessions[0].extensiv_order_id) {
  const orderId = sessions[0].extensiv_order_id;
  const [orderShipments] = await db.execute("SELECT id, session_id, order_id, carrier_code, service_code, status FROM rate_wizard_shipments WHERE order_id = ?", [String(orderId)]);
  console.log(`\n=== rate_wizard_shipments for extensiv_order_id ${orderId} ===`);
  console.log(orderShipments);
}

await db.end();
