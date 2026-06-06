import { createConnection } from "mysql2/promise";
import xlsx from "xlsx";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

// Read the spreadsheet
const wb = xlsx.readFile("/home/ubuntu/upload/MasterWeightsK18.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws);

console.log(`Found ${rows.length} SKUs in spreadsheet`);

// K18 has 3 customer IDs under config 3
const CONFIG_ID = 3;
const CUSTOMER_IDS = [129, 130, 217]; // B2B, D2C, BST

const conn = await createConnection(url);

let inserted = 0;
let updated = 0;

for (const row of rows) {
  const sku = String(row["Sku"] ?? "").trim();
  const cartonWeightLb = parseFloat(row["Full Case weight"]);
  const unitsPerCarton = parseInt(row["Units per case"], 10);

  if (!sku || isNaN(cartonWeightLb) || isNaN(unitsPerCarton)) {
    console.warn(`Skipping invalid row:`, row);
    continue;
  }

  for (const customerId of CUSTOMER_IDS) {
    const [existing] = await conn.execute(
      "SELECT id FROM sku_weight_overrides WHERE config_id = ? AND customer_id = ? AND sku = ?",
      [CONFIG_ID, customerId, sku]
    );

    if (existing.length > 0) {
      await conn.execute(
        "UPDATE sku_weight_overrides SET carton_weight_lb = ?, units_per_carton = ?, note = ?, updated_at = NOW() WHERE config_id = ? AND customer_id = ? AND sku = ?",
        [cartonWeightLb, unitsPerCarton, "Imported from MasterWeightsK18.xlsx — full case weight", CONFIG_ID, customerId, sku]
      );
      updated++;
    } else {
      await conn.execute(
        "INSERT INTO sku_weight_overrides (config_id, customer_id, sku, carton_weight_lb, units_per_carton, note) VALUES (?, ?, ?, ?, ?, ?)",
        [CONFIG_ID, customerId, sku, cartonWeightLb, unitsPerCarton, "Imported from MasterWeightsK18.xlsx — full case weight"]
      );
      inserted++;
    }
  }
}

console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
console.log(`Total records written: ${inserted + updated} (${rows.length} SKUs × ${CUSTOMER_IDS.length} customer IDs)`);
await conn.end();
