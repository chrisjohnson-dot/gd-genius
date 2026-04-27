/**
 * Generates a sample GD pallet label PDF for preview.
 * Run: npx tsx scripts/gen-sample-label.ts
 */
import { createWriteStream } from "fs";
import { generateGdPalletLabel } from "../server/pdf/gdPalletLabelGenerator";

const outPath = "/tmp/sample-gd-label.pdf";
const stream = createWriteStream(outPath);

generateGdPalletLabel(
  [
    {
      shipFromName: "Go Direct Logistics",
      shipFromAddress: "4-149 High Plains Place",
      shipFromCityStateZip: "Rockyview County, AB  T4A0W7",
      shipToName: "Meridian Retail Group",
      shipToAddress: "1200 Commerce Blvd",
      shipToCityStateZip: "Columbus, OH  43215",
      transactionId: 3356962,
      referenceNumber: "REF-2026-MIX",
      poNumber: "PO-DEMO-2026-MIX",
      weightLbs: 248,
      dimL: 48,
      dimW: 40,
      dimH: 52,
      palletNumber: 1,
      totalPallets: 3,
      palletUpc: "00123456789012",
      items: [
        { sku: "MIX-CANDLE-VAN-12OZ", description: "Vanilla Candle 12oz", qty: 48 },
        { sku: "MIX-CANDLE-LAV-12OZ", description: "Lavender Candle 12oz", qty: 36 },
        { sku: "MIX-SOAP-SHEA-BAR",   description: "Shea Butter Soap Bar",  qty: 60 },
        { sku: "MIX-LOTION-ROSE-8OZ", description: "Rose Lotion 8oz",       qty: 48 },
      ],
    },
  ],
  stream
);

stream.on("finish", () => {
  console.log(`Sample label written to ${outPath}`);
});
