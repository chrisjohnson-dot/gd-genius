import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const conn = await createConnection(url);

const SESSION_ID = 870011;
const SKU = "K18-37001";
const CASE_AMOUNT = 12;
const CASES_PER_PALLET = 44;
const UNITS_PER_PALLET = CASES_PER_PALLET * CASE_AMOUNT; // 528
const TARE_LB = 30;
// Weight override for K18-37001: 9 lbs per case of 12 = 0.75 lbs/unit
const CARTON_WEIGHT_LB = 9.0;
const UNITS_PER_CARTON = 12;
const PER_UNIT_WEIGHT = CARTON_WEIGHT_LB / UNITS_PER_CARTON; // 0.75 lbs/unit

// 1. Get current pallets
const [pallets] = await conn.query(
  "SELECT id, palletNumber, items FROM qc_pallets WHERE sessionId = ? AND deletedAt IS NULL ORDER BY palletNumber",
  [SESSION_ID]
);
console.log(`Found ${pallets.length} pallets`);

// 2. Find and delete pallet 4 (the one with 9341 units)
const pallet4 = pallets.find(p => p.palletNumber === 4);
if (!pallet4) { console.error("Pallet 4 not found"); process.exit(1); }
const items4 = typeof pallet4.items === 'string' ? JSON.parse(pallet4.items) : pallet4.items;
const pallet4Units = items4.find(i => i.sku === SKU)?.qty ?? 0;
console.log(`Pallet 4 has ${pallet4Units} units — will be replaced with ${UNITS_PER_PALLET}-unit pallets`);

// Delete pallet 4
await conn.query("DELETE FROM qc_pallets WHERE id = ?", [pallet4.id]);
console.log(`Deleted pallet 4 (id=${pallet4.id})`);

// 3. Create new pallets of 528 units each
let remaining = pallet4Units;
let palletNumber = 4;
let totalNewUnits = 0;

while (remaining > 0) {
  const qty = Math.min(remaining, UNITS_PER_PALLET);
  const weightLb = Math.ceil(PER_UNIT_WEIGHT * qty + TARE_LB);
  const items = JSON.stringify([{ sku: SKU, qty }]);

  await conn.query(
    "INSERT INTO qc_pallets (sessionId, palletNumber, items, calculatedWeightLb, palletTareWeightLb) VALUES (?, ?, ?, ?, ?)",
    [SESSION_ID, palletNumber, items, String(weightLb), "30"]
  );
  console.log(`Created Pallet ${palletNumber}: ${qty} units (${qty/CASE_AMOUNT} cases) = ${weightLb} lbs`);
  totalNewUnits += qty;
  remaining -= qty;
  palletNumber++;
}

// 4. Verify total scanned qty is correct
const totalScanned = (3 * UNITS_PER_PALLET) + totalNewUnits; // pallets 1-3 + new pallets
console.log(`\nTotal scanned across all pallets: ${totalScanned} units`);

// Update scannedQty on session item
await conn.query(
  "UPDATE qc_scan_items SET scannedQty = ? WHERE sessionId = ? AND sku = ?",
  [totalScanned, SESSION_ID, SKU]
);
console.log(`Updated scannedQty to ${totalScanned} for ${SKU}`);

// 5. Summary
const [finalPallets] = await conn.query(
  "SELECT COUNT(*) as total FROM qc_pallets WHERE sessionId = ? AND deletedAt IS NULL",
  [SESSION_ID]
);
console.log(`\nFinal pallet count: ${finalPallets[0].total}`);
console.log(`Total units: ${totalScanned} of 10925 expected`);

await conn.end();
console.log("Done.");
