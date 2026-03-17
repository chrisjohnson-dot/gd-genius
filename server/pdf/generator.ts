import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";
import type { Response } from "express";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PullListItem {
  sku: string;
  description?: string;
  qty: number;
  sourceQty?: number;
  lotNumber?: string;
  expirationDate?: string;
  fromLocationName: string;
  fromLocationType: string;
  toLocationName: string;
  /** Extensiv order IDs that this movement serves */
  affectedOrderIds?: number[];
  movement?: "to_staging" | "to_pick_face";
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
  poNum?: string;
  shipToName?: string;
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

// ─── Brand colours ────────────────────────────────────────────────────────────

const NAVY       = "#1a3a5c";
const GREEN      = "#3d8b3d";
const GREEN_LIGHT = "#e8f5e9";
const GREEN_TEXT = "#2e7d32";
const TEXT_DARK  = "#0f172a";
const TEXT_MUTED = "#888888";
const ROW_ALT    = "#f0f4f8";
const HEADER_BG  = NAVY;
const WHITE      = "#ffffff";
const BORDER     = "#d0d8e4";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

function formatDateShort(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  } catch { return "—"; }
}

/** Load GD logo from static assets (falls back gracefully if not found) */
function getLogoPath(): string | null {
  const p = path.resolve("/home/ubuntu/webdev-static-assets/gdlogo-transparent.png");
  return fs.existsSync(p) ? p : null;
}

/** Generate a Code 128 barcode PNG buffer */
async function makeBarcodeBuffer(text: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: "center",
      textsize: 8,
    });
  } catch { return null; }
}

// ─── Shared page header ───────────────────────────────────────────────────────

/**
 * Draws the branded two-stripe header with logo and document title.
 * Returns the Y position after the header (ready for content).
 */
function drawBrandedHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  logoPath: string | null,
  pageWidth: number,
  margin: number
): number {
  const navyH = 52;
  const greenH = 6;

  // Navy stripe
  doc.rect(0, 0, pageWidth, navyH).fill(NAVY);
  // Green stripe
  doc.rect(0, navyH, pageWidth, greenH).fill(GREEN);

  // Logo
  const logoW = 70;
  const logoH = 36;
  const logoY = (navyH - logoH) / 2;
  if (logoPath) {
    doc.image(logoPath, margin, logoY, { width: logoW, height: logoH });
  }

  // Document title
  doc
    .fillColor(WHITE)
    .fontSize(16)
    .font("Helvetica-Bold")
    .text(title, margin + logoW + 12, 16, { width: pageWidth - margin - logoW - 12 - margin });

  return navyH + greenH + 10; // content starts here
}

/** Compact continuation header for multi-page pack sheets */
function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  orderId: number,
  logoPath: string | null,
  pageWidth: number,
  margin: number
): number {
  const h = 36;
  doc.rect(0, 0, pageWidth, h).fill(NAVY);
  doc.rect(0, h, pageWidth, 4).fill(GREEN);
  if (logoPath) {
    doc.image(logoPath, margin, 4, { width: 50, height: 28 });
  }
  doc
    .fillColor(WHITE)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(`PACK SHEET  ·  ID: ${orderId}`, margin + 58, 12, { width: pageWidth - margin - 58 - margin });
  return h + 4 + 8;
}

// ─── Meta row (CLIENT | WAREHOUSE | DATE | ORDER REF) ─────────────────────────

interface MetaField { label: string; value: string }

function drawMetaRow(
  doc: PDFKit.PDFDocument,
  fields: MetaField[],
  x: number,
  y: number,
  totalWidth: number
): number {
  const rowH = 36;
  const colW = totalWidth / fields.length;

  doc.rect(x, y, totalWidth, rowH).fill("#f5f8fc").stroke(BORDER);

  fields.forEach((f, i) => {
    const cx = x + i * colW + 8;
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(7)
      .font("Helvetica")
      .text(f.label.toUpperCase(), cx, y + 5, { width: colW - 16 });
    doc
      .fillColor(TEXT_DARK)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(f.value, cx, y + 16, { width: colW - 16 });
  });

  return y + rowH + 6;
}

// ─── Table helpers ────────────────────────────────────────────────────────────

interface ColDef { label: string; width: number; align?: "left" | "right" | "center" }

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  cols: ColDef[],
  x: number,
  y: number
): number {
  const rowH = 20;
  const totalW = cols.reduce((s, c) => s + c.width, 0);

  doc.rect(x, y, totalW, rowH).fill(HEADER_BG);

  let cx = x;
  for (const col of cols) {
    doc
      .fillColor(WHITE)
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .text(col.label.toUpperCase(), cx + 4, y + 6, { width: col.width - 8, align: col.align ?? "left" });
    cx += col.width;
  }
  return y + rowH;
}

interface CellDef { value: string; align?: "left" | "right" | "center"; color?: string; bold?: boolean; fontSize?: number }

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cells: CellDef[],
  widths: number[],
  x: number,
  y: number,
  rowIndex: number,
  rowHeight = 18
): number {
  const totalW = widths.reduce((s, w) => s + w, 0);
  if (rowIndex % 2 !== 0) {
    doc.rect(x, y, totalW, rowHeight).fill(ROW_ALT);
  }
  doc.rect(x, y, totalW, rowHeight).stroke(BORDER);

  let cx = x;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    const w = widths[i]!;
    doc
      .fillColor(cell.color ?? TEXT_DARK)
      .fontSize(cell.fontSize ?? 8)
      .font(cell.bold ? "Helvetica-Bold" : "Helvetica")
      .text(cell.value, cx + 4, y + (rowHeight - (cell.fontSize ?? 8)) / 2, {
        width: w - 8,
        align: cell.align ?? "left",
        lineBreak: false,
      });
    cx += w;
  }
  return y + rowHeight;
}

/** Draw a checkbox cell */
function drawCheckbox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, rowH: number) {
  const size = 10;
  const cx = x + (w - size) / 2;
  const cy = y + (rowH - size) / 2;
  doc.rect(cx, cy, size, size).stroke(TEXT_MUTED);
}

/** Total row with green background */
function drawTotalRow(
  doc: PDFKit.PDFDocument,
  label: string,
  total: number,
  x: number,
  y: number,
  totalWidth: number
): number {
  const rowH = 22;
  doc.rect(x, y, totalWidth, rowH).fill(GREEN_LIGHT).stroke(BORDER);
  doc
    .fillColor(TEXT_DARK)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(label, x + 8, y + 6, { width: totalWidth - 100 });
  doc
    .fillColor(GREEN_TEXT)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(String(total), x + totalWidth - 90, y + 4, { width: 80, align: "right" });
  return y + rowH;
}

/** Sign-off section */
function drawSignOff(
  doc: PDFKit.PDFDocument,
  fields: string[],
  x: number,
  y: number,
  totalWidth: number
): number {
  const lineH = 28;
  const colW = totalWidth / fields.length;

  doc
    .fillColor(GREEN_TEXT)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("SIGN-OFF", x, y);
  // underline
  doc.moveTo(x, y + 11).lineTo(x + 52, y + 11).stroke(GREEN_TEXT);

  y += 16;

  for (let i = 0; i < fields.length; i++) {
    const fx = x + i * colW;
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(7.5)
      .font("Helvetica")
      .text(fields[i]!.toUpperCase(), fx, y, { width: colW - 10 });
    // signature line
    doc
      .moveTo(fx, y + lineH)
      .lineTo(fx + colW - 16, y + lineH)
      .stroke(TEXT_MUTED);
  }

  return y + lineH + 10;
}

/** Page footer */
function drawPageFooter(
  doc: PDFKit.PDFDocument,
  label: string,
  pageWidth: number,
  margin: number
) {
  const footerY = doc.page.height - 28;
  doc
    .fillColor(TEXT_MUTED)
    .fontSize(7)
    .font("Helvetica")
    .text("GD Allocation Wizard", margin, footerY, { width: pageWidth - margin * 2 });
  doc
    .fillColor(TEXT_MUTED)
    .fontSize(7)
    .font("Helvetica")
    .text(label, margin, footerY, { width: pageWidth - margin * 2, align: "right" });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed = 30) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

// ─── 1. PICK FACE PULL SHEET ──────────────────────────────────────────────────

export function generatePickFacePullSheetPDF(
  res: Response,
  items: PullListItem[],
  meta: RunMeta
) {
  const logoPath = getLogoPath();
  const doc = new PDFDocument({ margin: 40, size: "LETTER", autoFirstPage: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="pick-face-pull-sheet-run-${meta.runId}.pdf"`);
  doc.pipe(res);

  const margin = 40;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;

  // Filter to pick-face items only
  const pfItems = items.filter((i) => i.fromLocationType === "pick_face" || i.movement === "to_staging" && (i.fromLocationType === "pick_face"));

  let contentY = drawBrandedHeader(doc, "PICK FACE PULL SHEET", logoPath, pageWidth, margin);

  const customers = meta.customerName ?? (() => {
    try { return meta.customerNames ? JSON.parse(meta.customerNames).join(", ") : "—"; } catch { return meta.customerNames ?? "—"; }
  })();

  contentY = drawMetaRow(doc, [
    { label: "Client", value: customers },
    { label: "Warehouse", value: meta.facilityName ?? "—" },
    { label: "Date", value: formatDateShort(meta.createdAt) },
    { label: "Run #", value: String(meta.runId) },
  ], margin, contentY, tableWidth);

  doc.y = contentY;

  if (pfItems.length === 0) {
    doc.fillColor(TEXT_MUTED).fontSize(10).text("No pick face movements required.", margin, doc.y, { width: tableWidth, align: "center" });
    doc.end();
    return;
  }

  // Columns: FACE LOCATION | SKU | LOT # | QTY TO PICK | ☐
  const chkW = 24;
  const locW = 130;
  const skuW = 100;
  const lotW = 90;
  const qtyW = tableWidth - locW - skuW - lotW - chkW;

  const cols: ColDef[] = [
    { label: "Face Location", width: locW },
    { label: "SKU",           width: skuW },
    { label: "Lot #",         width: lotW },
    { label: "Qty to Pick",   width: qtyW, align: "right" },
    { label: "✓",             width: chkW, align: "center" },
  ];

  let rowY = drawTableHeader(doc, cols, margin, doc.y);
  let totalQty = 0;

  pfItems.forEach((item, i) => {
    if (rowY + 18 > doc.page.height - 80) {
      doc.addPage();
      contentY = drawBrandedHeader(doc, "PICK FACE PULL SHEET (cont.)", logoPath, pageWidth, margin);
      doc.y = contentY;
      rowY = drawTableHeader(doc, cols, margin, doc.y);
    }

    const cells: CellDef[] = [
      { value: item.fromLocationName, color: GREEN_TEXT, bold: true },
      { value: item.sku, bold: true },
      { value: item.lotNumber ?? "—", color: item.lotNumber ? TEXT_DARK : TEXT_MUTED },
      { value: String(item.qty), align: "right", bold: true },
      { value: "" },
    ];

    rowY = drawTableRow(doc, cells, cols.map((c) => c.width), margin, rowY, i);
    // draw checkbox in last cell
    drawCheckbox(doc, margin + locW + skuW + lotW + qtyW, rowY - 18, chkW, 18);
    totalQty += item.qty;
  });

  doc.y = rowY + 4;
  const afterTotal = drawTotalRow(doc, "TOTAL UNITS TO PICK", totalQty, margin, doc.y, tableWidth);
  doc.y = afterTotal + 12;
  drawSignOff(doc, ["Picker Name"], margin, doc.y, tableWidth);

  drawPageFooter(doc, `Page 1  ·  Run #${meta.runId}`, pageWidth, margin);
  doc.end();
}

// ─── 2. WAREHOUSE PULL SHEET ──────────────────────────────────────────────────

export function generateWarehousePullSheetPDF(
  res: Response,
  items: PullListItem[],
  meta: RunMeta
) {
  const logoPath = getLogoPath();
  const doc = new PDFDocument({ margin: 40, size: "LETTER", autoFirstPage: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="warehouse-pull-sheet-run-${meta.runId}.pdf"`);
  doc.pipe(res);

  const margin = 40;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;

  // Warehouse items = items coming from warehouse locations
  const whItems = items.filter((i) => i.fromLocationType === "warehouse");

  let contentY = drawBrandedHeader(doc, "WAREHOUSE PULL SHEET", logoPath, pageWidth, margin);

  const customers = meta.customerName ?? (() => {
    try { return meta.customerNames ? JSON.parse(meta.customerNames).join(", ") : "—"; } catch { return meta.customerNames ?? "—"; }
  })();

  contentY = drawMetaRow(doc, [
    { label: "Client",    value: customers },
    { label: "Warehouse", value: meta.facilityName ?? "—" },
    { label: "Date",      value: formatDateShort(meta.createdAt) },
    { label: "Run #",     value: String(meta.runId) },
  ], margin, contentY, tableWidth);

  doc.y = contentY;

  if (whItems.length === 0) {
    doc.fillColor(TEXT_MUTED).fontSize(10).text("No warehouse movements required.", margin, doc.y, { width: tableWidth, align: "center" });
    doc.end();
    return;
  }

  // Columns: SKU | FROM LOCATION | TO LOCATION | QTY TO PULL | TOTAL REQ. | AFFECTED ORDERS | ☐
  const chkW = 24;
  const skuW = 80;
  const fromW = 110;
  const toW = 110;
  const qtyW = 60;
  const totalReqW = 60;
  const affectedW = tableWidth - skuW - fromW - toW - qtyW - totalReqW - chkW;

  const cols: ColDef[] = [
    { label: "SKU",              width: skuW },
    { label: "From Location",    width: fromW },
    { label: "To Location",      width: toW },
    { label: "Qty to Pull",      width: qtyW, align: "right" },
    { label: "Total Req.",       width: totalReqW, align: "right" },
    { label: "Affected Orders",  width: affectedW },
    { label: "✓",                width: chkW, align: "center" },
  ];

  let rowY = drawTableHeader(doc, cols, margin, doc.y);
  let totalQty = 0;

  whItems.forEach((item, i) => {
    if (rowY + 18 > doc.page.height - 80) {
      doc.addPage();
      contentY = drawBrandedHeader(doc, "WAREHOUSE PULL SHEET (cont.)", logoPath, pageWidth, margin);
      doc.y = contentY;
      rowY = drawTableHeader(doc, cols, margin, doc.y);
    }

    const isPickFaceDest = item.toLocationName.toLowerCase().includes("pick") ||
      item.movement === "to_pick_face";
    const toColor = isPickFaceDest ? GREEN_TEXT : TEXT_MUTED;
    const toLabel = isPickFaceDest ? item.toLocationName : "STAGING";

    const affectedText = item.affectedOrderIds?.length
      ? item.affectedOrderIds.map((id) => String(id)).join(", ")
      : "—";

    const cells: CellDef[] = [
      { value: item.sku, bold: true },
      { value: item.fromLocationName },
      { value: toLabel, color: toColor, bold: isPickFaceDest },
      { value: String(item.qty), align: "right", bold: true },
      { value: item.sourceQty != null ? String(item.sourceQty) : "—", align: "right", color: TEXT_MUTED },
      { value: affectedText, fontSize: 7 },
      { value: "" },
    ];

    rowY = drawTableRow(doc, cells, cols.map((c) => c.width), margin, rowY, i);
    drawCheckbox(doc, margin + skuW + fromW + toW + qtyW + totalReqW + affectedW, rowY - 18, chkW, 18);
    totalQty += item.qty;
  });

  doc.y = rowY + 4;
  const afterTotal = drawTotalRow(doc, "TOTAL UNITS TO PULL", totalQty, margin, doc.y, tableWidth);
  doc.y = afterTotal + 12;
  drawSignOff(doc, ["Picker Name"], margin, doc.y, tableWidth);

  drawPageFooter(doc, `Page 1  ·  Run #${meta.runId}`, pageWidth, margin);
  doc.end();
}

// ─── 3. PACK SHEET ────────────────────────────────────────────────────────────

export async function generatePackListPDF(
  res: Response,
  orders: OrderPackData[],
  meta: RunMeta
) {
  // Pre-generate all barcodes
  const barcodeMap = new Map<number, Buffer | null>();
  await Promise.all(orders.map(async (o) => {
    barcodeMap.set(o.orderId, await makeBarcodeBuffer(String(o.orderId)));
  }));

  const logoPath = getLogoPath();
  const doc = new PDFDocument({ margin: 40, size: "LETTER", autoFirstPage: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="pack-sheet-run-${meta.runId}.pdf"`);
  doc.pipe(res);

  const margin = 40;
  const pageWidth = doc.page.width;
  const tableWidth = pageWidth - margin * 2;

  if (orders.length === 0) {
    drawBrandedHeader(doc, "PACK SHEET", logoPath, pageWidth, margin);
    doc.fillColor(TEXT_MUTED).fontSize(10).text("No items to pack.", margin, 80, { width: tableWidth, align: "center" });
    doc.end();
    return;
  }

  const customers = meta.customerName ?? (() => {
    try { return meta.customerNames ? JSON.parse(meta.customerNames).join(", ") : "—"; } catch { return meta.customerNames ?? "—"; }
  })();

  // Columns: LOCATION | SKU | DESCRIPTION | LOT # | QTY | ☐
  const chkW = 24;
  const locW = 100;
  const skuW = 80;
  const descW = 180;
  const lotW = 80;
  const qtyW = tableWidth - locW - skuW - descW - lotW - chkW;

  const cols: ColDef[] = [
    { label: "Location",    width: locW },
    { label: "SKU",         width: skuW },
    { label: "Description", width: descW },
    { label: "Lot #",       width: lotW },
    { label: "Qty",         width: qtyW, align: "right" },
    { label: "✓",           width: chkW, align: "center" },
  ];

  for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
    const order = orders[orderIdx]!;

    if (orderIdx > 0) {
      doc.addPage();
    }

    // ── Header ──────────────────────────────────────────────────────────────
    let contentY = drawBrandedHeader(doc, "PACK SHEET", logoPath, pageWidth, margin);

    // Transaction ID box (top-right)
    const txBoxW = 180;
    const txBoxH = 52;
    const txBoxX = pageWidth - margin - txBoxW;
    const txBoxY = 4;
    doc.rect(txBoxX, txBoxY, txBoxW, txBoxH).fill("#f5f8fc").stroke(BORDER);
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(7)
      .font("Helvetica")
      .text("TRANSACTION ID", txBoxX + 6, txBoxY + 4, { width: txBoxW - 12 });
    doc
      .fillColor(TEXT_DARK)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(String(order.orderId), txBoxX + 6, txBoxY + 14, { width: txBoxW - 12 });

    // Barcode
    const barcodeBuffer = barcodeMap.get(order.orderId);
    if (barcodeBuffer) {
      const bW = txBoxW - 12;
      const bH = 22;
      doc.image(barcodeBuffer, txBoxX + 6, txBoxY + 28, { width: bW, height: bH });
    }

    // Meta row: CLIENT | SHIP TO
    contentY = drawMetaRow(doc, [
      { label: "Client",  value: customers },
      { label: "Ship To", value: order.shipToName ?? order.referenceNum ?? "—" },
      { label: "PO #",    value: order.poNum ?? "—" },
      { label: "Date",    value: formatDateShort(meta.createdAt) },
    ], margin, contentY, tableWidth);

    doc.y = contentY;

    if (order.items.length === 0) {
      doc.fillColor(TEXT_MUTED).fontSize(10).text("No items for this order.", margin, doc.y, { width: tableWidth, align: "center" });
    } else {
      let rowY = drawTableHeader(doc, cols, margin, doc.y);
      let totalQty = 0;
      let pageNum = 1;

      order.items.forEach((item, i) => {
        if (rowY + 20 > doc.page.height - 100) {
          drawPageFooter(doc, `Page ${pageNum} of ?  ·  Order #${order.orderId}`, pageWidth, margin);
          doc.addPage();
          pageNum++;
          const cy = drawContinuationHeader(doc, order.orderId, logoPath, pageWidth, margin);
          doc.y = cy;
          rowY = drawTableHeader(doc, cols, margin, doc.y);
        }

        const cells: CellDef[] = [
          { value: item.locationName, bold: true },
          { value: item.sku },
          { value: item.description ?? "—" },
          { value: item.lotNumber ?? "—", color: item.lotNumber ? TEXT_DARK : TEXT_MUTED },
          { value: String(item.qty), align: "right", bold: true },
          { value: "" },
        ];

        rowY = drawTableRow(doc, cells, cols.map((c) => c.width), margin, rowY, i, 20);
        drawCheckbox(doc, margin + locW + skuW + descW + lotW + qtyW, rowY - 20, chkW, 20);
        totalQty += item.qty;
      });

      doc.y = rowY + 4;
      const afterTotal = drawTotalRow(doc, "TOTAL UNITS", totalQty, margin, doc.y, tableWidth);
      doc.y = afterTotal + 12;
      drawSignOff(doc, ["Picker Name", "QC Name", "Total Pallets"], margin, doc.y, tableWidth);
      drawPageFooter(doc, `Page ${pageNum}  ·  Order #${order.orderId}  ·  ${order.totalLines} lines  ·  ${order.totalPieces} pcs`, pageWidth, margin);
    }
  }

  doc.end();
}

// ─── Legacy combined pull list (kept for backward compat) ─────────────────────

export function generatePullListPDF(
  res: Response,
  items: PullListItem[],
  meta: RunMeta
) {
  // Route to pick-face sheet — warehouse sheet is separate endpoint
  generatePickFacePullSheetPDF(res, items, meta);
}
