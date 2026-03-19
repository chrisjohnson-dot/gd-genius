import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import {
  generatePickFacePullSheetPDF,
  generateWarehousePullSheetPDF,
  generatePackListPDF,
  type PullListItem,
  type RunMeta,
  type OrderPackData,
} from "../server/pdf/generator.js";

await mkdir("/home/ubuntu/sample-pdfs", { recursive: true });

const meta: RunMeta = {
  runId: 42,
  facilityName: "ACR Warehouse",
  customerName: "Acme Corp",
  createdAt: new Date("2026-03-19"),
  allocatedCount: 3,
  skippedCount: 0,
  isDuplicate: false,
  orderIds: [100201, 100202],
};

const pfItems: PullListItem[] = [
  {
    sku: "SKU-ALPHA-001",
    description: "Alpha Widget",
    qty: 48,
    sourceQty: 12,
    totalRequired: 12,
    lotNumber: "LOT-2024-A",
    expirationDate: "2026-06-01",
    fromLocationName: "ACR-PF-A01",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
  {
    sku: "SKU-BETA-002",
    description: "Beta Gadget",
    qty: 24,
    sourceQty: 6,
    totalRequired: 6,
    lotNumber: "LOT-2024-B",
    expirationDate: "2026-09-15",
    fromLocationName: "ACR-PF-B03",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
  {
    sku: "SKU-GAMMA-003",
    description: "Gamma Device",
    qty: 10,
    sourceQty: 10,
    totalRequired: 10,
    lotNumber: "LOT-2025-C",
    fromLocationName: "ACR-PF-C07",
    fromLocationType: "pick_face",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
];

const whItems: PullListItem[] = [
  // Pallet A: full pallet goes to staging (no surplus)
  {
    sku: "SKU-DELTA-004",
    description: "Delta Component",
    qty: 20,
    sourceQty: 20,
    lotNumber: "LOT-2024-D",
    fromLocationName: "WH-RACK-A01",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
  // Pallet B: split — 15 to staging, 35 surplus to pick face (same location, same SKU, same lot)
  {
    sku: "SKU-EPSILON-005",
    description: "Epsilon Part",
    qty: 15,
    sourceQty: 50,
    lotNumber: "LOT-2024-E",
    fromLocationName: "WH-RACK-B02",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
  {
    sku: "SKU-EPSILON-005",
    description: "Epsilon Part",
    qty: 35,
    sourceQty: 50,
    lotNumber: "LOT-2024-E",
    fromLocationName: "WH-RACK-B02",
    fromLocationType: "warehouse",
    toLocationName: "ACR-PF-B03",
    movement: "to_pick_face",
  },
  // Pallet C: all to staging
  {
    sku: "SKU-ZETA-006",
    description: "Zeta Assembly",
    qty: 8,
    sourceQty: 75,
    lotNumber: "LOT-2025-F",
    fromLocationName: "WH-RACK-C05",
    fromLocationType: "warehouse",
    toLocationName: "ACR-Staging",
    movement: "to_staging",
  },
];

const allItems = [...pfItems, ...whItems];

// Pick face pull sheet
{
  const out = createWriteStream("/home/ubuntu/sample-pdfs/pick-face-pull-sheet-sample.pdf");
  await generatePickFacePullSheetPDF(out as any, allItems, meta);
  await new Promise((r) => out.on("finish", r));
  console.log("✓ pick-face-pull-sheet-sample.pdf");
}

// Warehouse pull sheet
{
  const out = createWriteStream("/home/ubuntu/sample-pdfs/warehouse-pull-sheet-sample.pdf");
  await generateWarehousePullSheetPDF(out as any, allItems, meta);
  await new Promise((r) => out.on("finish", r));
  console.log("✓ warehouse-pull-sheet-sample.pdf");
}

// Pack list
const orders: OrderPackData[] = [
  {
    orderId: 100201,
    referenceNum: "REF-100201",
    poNum: "PO-9001",
    shipToName: "Acme Distribution Center",
    totalLines: 2,
    totalPieces: 18,
    items: [
      { orderId: 100201, referenceNum: "REF-100201", sku: "SKU-ALPHA-001", description: "Alpha Widget", qty: 12, lotNumber: "LOT-2024-A", expirationDate: "2026-06-01", locationName: "ACR-Staging" },
      { orderId: 100201, referenceNum: "REF-100201", sku: "SKU-BETA-002", description: "Beta Gadget", qty: 6, lotNumber: "LOT-2024-B", expirationDate: "2026-09-15", locationName: "ACR-Staging" },
    ],
  },
];
{
  const out = createWriteStream("/home/ubuntu/sample-pdfs/pack-list-sample.pdf");
  await generatePackListPDF(out as any, orders, meta);
  await new Promise((r) => out.on("finish", r));
  console.log("✓ pack-list-sample.pdf");
}
