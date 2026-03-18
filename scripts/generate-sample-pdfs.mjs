/**
 * Generates sample pick face pull sheet, warehouse pull sheet, and pack list PDFs
 * using realistic mock data for GD Logistics / Amercare.
 *
 * Run with:  node scripts/generate-sample-pdfs.mjs
 */

import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Dynamically import the compiled generators via tsx
const { generatePickFacePullSheetPDF, generateWarehousePullSheetPDF, generatePackListPDF } =
  await import(`${projectRoot}/server/pdf/generator.ts`);

// ── Mock data ────────────────────────────────────────────────────────────────

const runMeta = {
  runId: 90020,
  facilityName: "GD Los Angeles",
  customerName: "Amercare Products",
  customerNames: ["Amercare Products"],
  createdAt: Date.now(),
  allocatedCount: 3,
  skippedCount: 0,
  isDuplicate: false,
  orderIds: [3219827, 3219828, 3219829],
};

/** Pick face pull list — direct picks from pick face + one warehouse→pick_face transfer */
const pickFacePullList = [
  {
    sku: "AMR-GLOVE-L-BX",
    description: "Amercare Nitrile Gloves Large Box/100",
    qty: 48,           // onhand at location
    sourceQty: 48,
    totalRequired: 48, // qty required by orders
    lotNumber: "LOT2024-0891",
    expirationDate: "2026-09-30",
    fromLocationName: "ACR527",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
  },
  {
    sku: "AMR-GLOVE-M-BX",
    description: "Amercare Nitrile Gloves Medium Box/100",
    qty: 72,
    sourceQty: 72,
    totalRequired: 60,
    lotNumber: "LOT2024-0892",
    expirationDate: "2026-09-30",
    fromLocationName: "ACR528",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
  },
  {
    sku: "AMR-APRON-DISP",
    description: "Disposable Poly Aprons White 28x46",
    qty: 24,
    sourceQty: 24,
    totalRequired: 24,
    lotNumber: "0",
    expirationDate: null,
    fromLocationName: "ACR530",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
  },
  // Warehouse→pick_face transfer: pallet moved from warehouse to replenish pick face
  {
    sku: "AMR-MASK-PROC-BX",
    description: "Procedure Masks Blue 3-Ply Box/50",
    qty: 120,
    sourceQty: 120,
    totalRequired: 96,
    lotNumber: "LOT2025-0112",
    expirationDate: "2027-03-15",
    fromLocationName: "12050101",   // warehouse source
    fromLocationType: "warehouse",
    toLocationName: "ACR531",       // pick face destination
    toLocationId: 5531,
    movement: "to_pick_face",
  },
  {
    sku: "AMR-TOWEL-C-FOLD",
    description: "C-Fold Paper Towels 200ct/pk 12pk/cs",
    qty: 36,
    sourceQty: 36,
    totalRequired: 36,
    lotNumber: "0",
    expirationDate: null,
    fromLocationName: "ACR533",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
  },
];

/** Warehouse pull list — pallets being moved from warehouse to staging */
const warehousePullList = [
  {
    sku: "AMR-GLOVE-L-CS",
    description: "Amercare Nitrile Gloves Large Case/10bx",
    qty: 5,
    sourceQty: 18,
    totalRequired: 5,
    lotNumber: "LOT2024-0891",
    expirationDate: "2026-09-30",
    fromLocationName: "09020301",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
    affectedOrderIds: [3219827],
  },
  {
    sku: "AMR-GLOVE-M-CS",
    description: "Amercare Nitrile Gloves Medium Case/10bx",
    qty: 3,
    sourceQty: 12,
    totalRequired: 3,
    lotNumber: "LOT2024-0892",
    expirationDate: "2026-09-30",
    fromLocationName: "09020302",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
    affectedOrderIds: [3219827, 3219828],
  },
  {
    sku: "AMR-MASK-PROC-CS",
    description: "Procedure Masks Blue 3-Ply Case/20bx",
    qty: 6,
    sourceQty: 24,
    totalRequired: 6,
    lotNumber: "LOT2025-0112",
    expirationDate: "2027-03-15",
    fromLocationName: "12050101",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
    affectedOrderIds: [3219828, 3219829],
  },
  {
    sku: "AMR-SOAP-FOAM-CS",
    description: "Foam Hand Soap 1000ml Refill Case/6",
    qty: 4,
    sourceQty: 10,
    totalRequired: 4,
    lotNumber: "0",
    expirationDate: null,
    fromLocationName: "14030201",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    toLocationId: 9901,
    movement: "to_staging",
    affectedOrderIds: [3219829],
  },
];

/** Pack list — one order with multiple line items */
const orderPackData = [
  {
    orderId: 3219827,
    referenceNum: "SO-2026-0391",
    poNum: "PO-AC-88821",
    shipToName: "Cedars-Sinai Medical Center",
    totalLines: 4,
    totalPieces: 156,
    items: [
      {
        orderId: 3219827,
        referenceNum: "SO-2026-0391",
        sku: "AMR-GLOVE-L-BX",
        description: "Amercare Nitrile Gloves Large Box/100",
        qty: 48,
        lotNumber: "LOT2024-0891",
        expirationDate: "2026-09-30",
        locationName: "ACR527",
        dropLocation: null,
      },
      {
        orderId: 3219827,
        referenceNum: "SO-2026-0391",
        sku: "AMR-GLOVE-M-BX",
        description: "Amercare Nitrile Gloves Medium Box/100",
        qty: 60,
        lotNumber: "LOT2024-0892",
        expirationDate: "2026-09-30",
        locationName: "ACR528",
        dropLocation: null,
      },
      {
        orderId: 3219827,
        referenceNum: "SO-2026-0391",
        sku: "AMR-MASK-PROC-BX",
        description: "Procedure Masks Blue 3-Ply Box/50",
        qty: 24,
        lotNumber: "LOT2025-0112",
        expirationDate: "2027-03-15",
        locationName: "ACR531",
        dropLocation: "12050101",
      },
      {
        orderId: 3219827,
        referenceNum: "SO-2026-0391",
        sku: "AMR-APRON-DISP",
        description: "Disposable Poly Aprons White 28x46",
        qty: 24,
        lotNumber: null,
        expirationDate: null,
        locationName: "ACR530",
        dropLocation: null,
      },
    ],
  },
  {
    orderId: 3219828,
    referenceNum: "SO-2026-0392",
    poNum: "PO-AC-88822",
    shipToName: "UCLA Health Santa Monica",
    totalLines: 2,
    totalPieces: 48,
    items: [
      {
        orderId: 3219828,
        referenceNum: "SO-2026-0392",
        sku: "AMR-GLOVE-M-BX",
        description: "Amercare Nitrile Gloves Medium Box/100",
        qty: 24,
        lotNumber: "LOT2024-0892",
        expirationDate: "2026-09-30",
        locationName: "ACR528",
        dropLocation: null,
      },
      {
        orderId: 3219828,
        referenceNum: "SO-2026-0392",
        sku: "AMR-MASK-PROC-BX",
        description: "Procedure Masks Blue 3-Ply Box/50",
        qty: 24,
        lotNumber: "LOT2025-0112",
        expirationDate: "2027-03-15",
        locationName: "ACR531",
        dropLocation: "12050101",
      },
    ],
  },
];

// ── Generate PDFs ─────────────────────────────────────────────────────────────

const outDir = "/home/ubuntu/sample-pdfs";
await mkdir(outDir, { recursive: true });

console.log("Generating pick face pull sheet...");
const pfStream = createWriteStream(`${outDir}/pick-face-pull-sheet-sample.pdf`);
await generatePickFacePullSheetPDF(pfStream, pickFacePullList, runMeta);
console.log("  ✓ pick-face-pull-sheet-sample.pdf");

console.log("Generating warehouse pull sheet...");
const whStream = createWriteStream(`${outDir}/warehouse-pull-sheet-sample.pdf`);
await generateWarehousePullSheetPDF(whStream, warehousePullList, runMeta);
console.log("  ✓ warehouse-pull-sheet-sample.pdf");

console.log("Generating pack list...");
const packStream = createWriteStream(`${outDir}/pack-list-sample.pdf`);
await generatePackListPDF(packStream, orderPackData, runMeta);
console.log("  ✓ pack-list-sample.pdf");

console.log("\nAll sample PDFs written to", outDir);
