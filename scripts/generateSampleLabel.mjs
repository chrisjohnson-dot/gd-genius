/**
 * Sample GD Pallet Label generator — run with:
 *   node --loader ts-node/esm scripts/generateSampleLabel.mjs
 * or compiled via ts-node:
 *   npx ts-node --esm scripts/generateSampleLabel.mjs
 */
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamically import the TS module via ts-node
const { generateGdPalletLabel } = await import("../server/pdf/gdPalletLabelGenerator.ts");

const outputPath = join(__dirname, "../sample-pallet-label.pdf");
const out = createWriteStream(outputPath);

/** Two pallets — each with their own per-pallet quantities (not cumulative) */
const pallets = [
  {
    shipFromName: "Go Direct Solutions",
    shipFromAddress: "5830 Saltzgaber Road",
    shipFromCityStateZip: "Groveport, OH  43125",
    shipToName: "Target DC #0719",
    shipToAddress: "1000 Nicollet Mall",
    shipToCityStateZip: "Minneapolis, MN  55403",
    transactionId: "TXN-20260504",
    weightLbs: 312,
    dimL: 48,
    dimW: 40,
    dimH: 52,
    palletNumber: 1,
    totalPallets: 3,
    palletUpc: "00100012345678901",
    items: [
      { sku: "APP-TEE-SM-BLK",    description: "Classic Tee — Small Black",    qty: 4, caseAmount: 12 },
      { sku: "APP-TEE-MD-BLK",    description: "Classic Tee — Medium Black",   qty: 3, caseAmount: 12 },
      { sku: "APP-HOODIE-SM-NVY", description: "Pullover Hoodie — Small Navy", qty: 2, caseAmount:  6 },
    ],
  },
  {
    shipFromName: "Go Direct Solutions",
    shipFromAddress: "5830 Saltzgaber Road",
    shipFromCityStateZip: "Groveport, OH  43125",
    shipToName: "Target DC #0719",
    shipToAddress: "1000 Nicollet Mall",
    shipToCityStateZip: "Minneapolis, MN  55403",
    transactionId: "TXN-20260504",
    weightLbs: 278,
    dimL: 48,
    dimW: 40,
    dimH: 48,
    palletNumber: 2,
    totalPallets: 3,
    palletUpc: "00100012345678902",
    items: [
      { sku: "APP-TEE-LG-BLK",    description: "Classic Tee — Large Black",    qty: 5, caseAmount: 12 },
      { sku: "APP-HOODIE-MD-NVY", description: "Pullover Hoodie — Medium Navy", qty: 3, caseAmount:  6 },
    ],
  },
];

generateGdPalletLabel(pallets, out);
out.on("finish", () => console.log(`✅  Sample label written to: ${outputPath}`));
out.on("error", (e) => { console.error("Error:", e); process.exit(1); });
