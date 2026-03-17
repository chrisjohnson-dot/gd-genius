import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import type { Response } from "express";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PullListItem {
  sku: string;
  description?: string;
  qty: number;
  lotNumber?: string;
  expirationDate?: string;
  fromLocationName: string;
  fromLocationType: string;
  toLocationName: string;
}

export interface PackListItem {
  orderId?: number;
  referenceNum: string;
  sku: string;
  description?: string;
  qty: number;
  lotNumber?: string;
  expirationDate?: string;
  locationName: string;
}

/** Per-order data passed to the pack list generator */
export interface OrderPackData {
  orderId: number;
  referenceNum: string;
  totalLines: number;
  totalPieces: number;
  items: PackListItem[];
}

export interface RunMeta {
  runId: number;
  facilityName?: string | null;
  customerName?: string | null;
  customerNames?: string | null;
  createdAt: Date;
  allocatedCount: number;
  skippedCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRAND_COLOR = "#1e40af"; // indigo-800
const HEADER_BG = "#f1f5f9";   // slate-100
const BORDER_COLOR = "#e2e8f0"; // slate-200
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#64748b";

function formatDate(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function drawPageHeader(doc: PDFKit.PDFDocument, title: string, meta: RunMeta) {
  const pageWidth = doc.page.width;
  const margin = 50;

  // Top bar
  doc.rect(0, 0, pageWidth, 60).fill(BRAND_COLOR);

  // Title
  doc
    .fillColor("#ffffff")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("Go Direct Allocation Agent", margin, 14);

  doc
    .fillColor("#bfdbfe")
    .fontSize(10)
    .font("Helvetica")
    .text(title, margin, 34);

  // Run info on right
  const runInfo = `Run #${meta.runId}  ·  ${formatDate(meta.createdAt)}`;
  doc
    .fillColor("#bfdbfe")
    .fontSize(9)
    .text(runInfo, margin, 34, { align: "right", width: pageWidth - margin * 2 });

  doc.moveDown(0.5);
  doc.y = 70;

  // Meta row
  const customers = (() => {
    if (meta.customerName) return meta.customerName;
    if (meta.customerNames) {
      try { return JSON.parse(meta.customerNames).join(", "); } catch { return meta.customerNames; }
    }
    return "—";
  })();

  doc
    .fillColor(TEXT_MUTED)
    .fontSize(9)
    .font("Helvetica")
    .text(
      `Facility: ${meta.facilityName ?? "—"}   |   Customer(s): ${customers}   |   Allocated: ${meta.allocatedCount}   |   Skipped: ${meta.skippedCount}`,
      margin,
      doc.y,
      { width: pageWidth - margin * 2 }
    );

  doc.moveDown(0.8);
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: Array<{ label: string; width: number; align?: "left" | "right" | "center" }>, x: number) {
  const rowHeight = 20;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  doc.rect(x, doc.y, totalWidth, rowHeight).fill(HEADER_BG);
  doc.rect(x, doc.y, totalWidth, rowHeight).stroke(BORDER_COLOR);

  let cx = x;
  for (const col of columns) {
    doc
      .fillColor(TEXT_DARK)
      .fontSize(8)
      .font("Helvetica-Bold")
      .text(col.label, cx + 4, doc.y + 6, { width: col.width - 8, align: col.align ?? "left" });
    cx += col.width;
  }
  doc.y += rowHeight;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cells: Array<{ value: string; align?: "left" | "right" | "center" }>,
  widths: number[],
  x: number,
  rowIndex: number
) {
  const rowHeight = 18;
  const totalWidth = widths.reduce((s, w) => s + w, 0);

  // Alternating row background
  if (rowIndex % 2 === 0) {
    doc.rect(x, doc.y, totalWidth, rowHeight).fill("#f8fafc");
  }
  doc.rect(x, doc.y, totalWidth, rowHeight).stroke(BORDER_COLOR);

  let cx = x;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const width = widths[i]!;
    doc
      .fillColor(TEXT_DARK)
      .fontSize(8)
      .font("Helvetica")
      .text(cell.value, cx + 4, doc.y + 5, { width: width - 8, align: cell.align ?? "left" });
    cx += width;
  }
  doc.y += rowHeight;
}

function ensurePageSpace(doc: PDFKit.PDFDocument, needed = 30) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

/** Generate a Code 128 barcode PNG buffer synchronously via bwip-js */
async function makeBarcodeBuffer(text: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 3,
      height: 14,
      includetext: true,
      textxalign: "center",
      textsize: 9,
    });
  } catch {
    return null;
  }
}

// ─── Pull List PDF ─────────────────────────────────────────────────────────────

export function generatePullListPDF(res: Response, items: PullListItem[], meta: RunMeta) {
  const doc = new PDFDocument({ margin: 50, size: "LETTER", autoFirstPage: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="pull-list-run-${meta.runId}.pdf"`
  );
  doc.pipe(res);

  const margin = 50;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;

  drawPageHeader(doc, "Pull List — Inventory Movements", meta);

  if (items.length === 0) {
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(11)
      .text("No inventory movements required. All inventory is already in staging.", margin, doc.y, {
        width: tableWidth,
        align: "center",
      });
    doc.end();
    return;
  }

  // Column widths (total = tableWidth)
  const cols = [
    { label: "SKU", width: 90, align: "left" as const },
    { label: "Description", width: 130, align: "left" as const },
    { label: "Qty", width: 40, align: "right" as const },
    { label: "Lot #", width: 70, align: "left" as const },
    { label: "Expiry", width: 65, align: "left" as const },
    { label: "From Location", width: 100, align: "left" as const },
    { label: "→", width: 20, align: "center" as const },
    { label: "To (Staging)", width: tableWidth - 90 - 130 - 40 - 70 - 65 - 100 - 20, align: "left" as const },
  ];

  drawTableHeader(doc, cols, margin);

  items.forEach((item, i) => {
    ensurePageSpace(doc, 22);
    drawTableRow(
      doc,
      [
        { value: item.sku },
        { value: item.description ?? "—" },
        { value: String(item.qty), align: "right" },
        { value: item.lotNumber ?? "—" },
        { value: formatDate(item.expirationDate) },
        { value: `[${item.fromLocationType}] ${item.fromLocationName}` },
        { value: "→", align: "center" },
        { value: item.toLocationName },
      ],
      cols.map((c) => c.width),
      margin,
      i
    );
  });

  // Footer
  doc
    .moveDown(1)
    .fillColor(TEXT_MUTED)
    .fontSize(8)
    .text(`Total movements: ${items.length}   |   Generated: ${new Date().toLocaleString()}`, margin, doc.y, {
      width: tableWidth,
      align: "right",
    });

  doc.end();
}

// ─── Pack List PDF (per-order pages with barcode) ─────────────────────────────

export async function generatePackListPDF(res: Response, orders: OrderPackData[], meta: RunMeta) {
  // Pre-generate all barcodes before streaming starts
  const barcodeMap = new Map<number, Buffer | null>();
  await Promise.all(
    orders.map(async (o) => {
      barcodeMap.set(o.orderId, await makeBarcodeBuffer(String(o.orderId)));
    })
  );

  const doc = new PDFDocument({ margin: 50, size: "LETTER", autoFirstPage: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="pack-list-run-${meta.runId}.pdf"`
  );
  doc.pipe(res);

  const margin = 50;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;

  if (orders.length === 0) {
    drawPageHeader(doc, "Pack List — Items to Pack per Order", meta);
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(11)
      .text("No items to pack.", margin, doc.y, { width: tableWidth, align: "center" });
    doc.end();
    return;
  }

  const cols = [
    { label: "SKU", width: 100, align: "left" as const },
    { label: "Description", width: 180, align: "left" as const },
    { label: "Qty", width: 45, align: "right" as const },
    { label: "Lot #", width: 75, align: "left" as const },
    { label: "Expiry", width: 65, align: "left" as const },
    { label: "Location", width: tableWidth - 100 - 180 - 45 - 75 - 65, align: "left" as const },
  ];

  let isFirstPage = true;

  for (const order of orders) {
    // Each order starts on a new page (except the first)
    if (!isFirstPage) {
      doc.addPage();
      doc.y = 50;
    }
    isFirstPage = false;

    // ── Order page header ──────────────────────────────────────────────────────

    // Top brand bar
    doc.rect(0, 0, pageWidth, 60).fill(BRAND_COLOR);
    doc
      .fillColor("#ffffff")
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("Go Direct Allocation Agent", margin, 14);
    doc
      .fillColor("#bfdbfe")
      .fontSize(10)
      .font("Helvetica")
      .text("Pack List", margin, 34);
    doc
      .fillColor("#bfdbfe")
      .fontSize(9)
      .text(`Run #${meta.runId}  ·  ${formatDate(meta.createdAt)}`, margin, 34, {
        align: "right",
        width: pageWidth - margin * 2,
      });

    doc.y = 75;

    // Order info box
    const infoBoxHeight = 80;
    doc.rect(margin, doc.y, tableWidth, infoBoxHeight).fill("#f0f9ff").stroke(BORDER_COLOR);

    const infoY = doc.y + 10;

    // Left side: order numbers
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(8)
      .font("Helvetica")
      .text("GO DIRECT ORDER #", margin + 10, infoY);
    doc
      .fillColor(TEXT_DARK)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(String(order.orderId), margin + 10, infoY + 10);

    doc
      .fillColor(TEXT_MUTED)
      .fontSize(8)
      .font("Helvetica")
      .text("CUSTOMER REF", margin + 10, infoY + 38);
    doc
      .fillColor(TEXT_DARK)
      .fontSize(11)
      .font("Helvetica")
      .text(order.referenceNum || "—", margin + 10, infoY + 48);

    // Middle: stats
    const statsX = margin + 200;
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(8)
      .font("Helvetica")
      .text("LINES", statsX, infoY);
    doc
      .fillColor(TEXT_DARK)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(String(order.totalLines), statsX, infoY + 10);

    doc
      .fillColor(TEXT_MUTED)
      .fontSize(8)
      .font("Helvetica")
      .text("TOTAL PIECES", statsX, infoY + 38);
    doc
      .fillColor(TEXT_DARK)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(String(order.totalPieces), statsX, infoY + 48);

    // Right side: barcode
    const barcodeBuffer = barcodeMap.get(order.orderId);
    if (barcodeBuffer) {
      const barcodeW = 180;
      const barcodeH = 55;
      const barcodeX = pageWidth - margin - barcodeW;
      const barcodeY = doc.y + 10;
      doc.image(barcodeBuffer, barcodeX, barcodeY, { width: barcodeW, height: barcodeH });
    }

    doc.y += infoBoxHeight + 12;

    // Facility / run meta line
    const customers = (() => {
      if (meta.customerName) return meta.customerName;
      if (meta.customerNames) {
        try { return JSON.parse(meta.customerNames).join(", "); } catch { return meta.customerNames; }
      }
      return "—";
    })();
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Facility: ${meta.facilityName ?? "—"}   |   Customer: ${customers}   |   Generated: ${new Date().toLocaleString()}`,
        margin,
        doc.y,
        { width: tableWidth }
      );
    doc.moveDown(0.6);

    // ── Items table ────────────────────────────────────────────────────────────
    if (order.items.length === 0) {
      doc
        .fillColor(TEXT_MUTED)
        .fontSize(10)
        .text("No items for this order.", margin, doc.y, { width: tableWidth, align: "center" });
    } else {
      drawTableHeader(doc, cols, margin);
      order.items.forEach((item, i) => {
        ensurePageSpace(doc, 22);
        drawTableRow(
          doc,
          [
            { value: item.sku },
            { value: item.description ?? "—" },
            { value: String(item.qty), align: "right" },
            { value: item.lotNumber ?? "—" },
            { value: formatDate(item.expirationDate) },
            { value: item.locationName },
          ],
          cols.map((c) => c.width),
          margin,
          i
        );
      });
    }

    // ── Page footer ────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 40;
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(7)
      .font("Helvetica")
      .text(
        `Pack List  ·  Run #${meta.runId}  ·  Order #${order.orderId}  ·  ${order.totalLines} lines  ·  ${order.totalPieces} pcs`,
        margin,
        footerY,
        { width: tableWidth, align: "center" }
      );
  }

  doc.end();
}
