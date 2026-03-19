import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import type { Response } from "express";
import type { Writable } from "stream";
import { GD_LOGO_B64 } from "./logo";

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
  /** qty actually needed by the order(s) */
  totalRequired?: number;
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
  /** Drop location (warehouse location the pallet came from) */
  dropLocation?: string;
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
  /** True when documents have been previously printed — renders a DUPLICATE badge beside the title */
  isDuplicate?: boolean;
  /** Order transaction IDs included in this run — shown in the TX ID box on pull sheets */
  orderIds?: number[];
}

// ─── Brand colours (official GD palette) ─────────────────────────────────────
const GD_DKBLUE  = "#15527f";
const GD_NAVY    = "#0e3a5a";
const GD_GREEN   = "#37A400";
const GD_GRAY    = "#a6a8ab";
const GD_DKGRAY  = "#333333";
const GD_LTGRAY  = "#F4F6F8";
const GD_BORDER  = "#CDD4DC";
const ROW_ALT    = "#EEF4FB";
const TOTAL_BG   = "#EDFAEB";
const TXN_BG     = "#EBF3FF";
const GD_BLUE    = "#1a64a0";
const WHITE      = "#ffffff";

// ─── Page constants ────────────────────────────────────────────────────────────
// PDFKit uses top-down coordinates: (0,0) = top-left
// Landscape Letter = 792 × 612 pt
const PAGE_W  = 792;
const PAGE_H  = 612;
const MARGIN  = 0.44 * 72;   // ~31.7 pt
const TOP_BAR = 16;           // blue accent bar height (from top)
const GRN_BAR = 3;            // green stripe height (below blue bar)
const FOOTER_H = 24;          // footer band height (from bottom)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLogoBuffer(): Buffer {
  // Logo is embedded as base64 in logo.ts — works in all environments including production
  return Buffer.from(GD_LOGO_B64, "base64");
}

function formatDate(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return "—"; }
}

function getCustomerName(meta: RunMeta): string {
  if (meta.customerName) return meta.customerName;
  try { return meta.customerNames ? JSON.parse(meta.customerNames).join(", ") : "—"; }
  catch { return meta.customerNames ?? "—"; }
}

async function makeBarcodeBuffer(text: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid: "code128",
      text,
      scale: 2,
      height: 14,
      includetext: false,
    });
  } catch { return null; }
}

// ─── Chrome: top bars + footer ────────────────────────────────────────────────
// In PDFKit: y=0 is top, y=PAGE_H is bottom

function drawChrome(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  // Blue accent bar at very top
  doc.rect(0, 0, PAGE_W, TOP_BAR).fill(GD_DKBLUE);
  // Green stripe immediately below blue bar
  doc.rect(0, TOP_BAR, PAGE_W, GRN_BAR).fill(GD_GREEN);

  // Footer band at bottom
  const footerY = PAGE_H - FOOTER_H;
  doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(GD_LTGRAY);
  doc.moveTo(0, footerY).lineTo(PAGE_W, footerY).stroke(GD_BORDER);
  doc
    .fillColor(GD_GRAY)
    .fontSize(7)
    .font("Helvetica")
    .text("GD Allocation Wizard", 0, footerY + 8, { width: PAGE_W, align: "center", lineBreak: false });
  doc
    .fillColor(GD_GRAY)
    .fontSize(7)
    .font("Helvetica")
    .text(`${pageNum} of ${totalPages}`, MARGIN, footerY + 8, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });
}

// ─── Full page-1 header ────────────────────────────────────────────────────────
// Returns Y coordinate just below the metadata block (ready for table)

function drawFullHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  logoPath: Buffer | null,
  metaFields: Array<{ label: string; value: string; x: number }>,
  isDuplicate?: boolean
): number {
  // Content starts just below the accent bars
  const contentY = TOP_BAR + GRN_BAR;  // ~19

  // Logo
  const logoH = 44;
  let logoW = 0;
  if (logoPath) {
    try {
      doc.image(logoPath, MARGIN, contentY + 4, { height: logoH });
      logoW = logoH * 1.4;  // approximate aspect ratio of the GD icon (wider than tall)
    } catch { logoW = 0; }
  }

  // Title — font size = half logo height, vertically centred on logo midpoint
  const titleFontSize = logoH / 2;
  const logoCentreY = contentY + 4 + logoH / 2;
  const capH = titleFontSize * 0.72;
  const titleY = logoCentreY - capH / 2;

  const titleX = MARGIN + logoW + 36;  // 36pt gap between logo right edge and first letter
  doc
    .fillColor(GD_NAVY)
    .fontSize(titleFontSize)
    .font("Helvetica-Bold")
    .text(title, titleX, titleY, { lineBreak: false });

  // DUPLICATE badge — shown when reprinting
  // Placed to the right of the TX ID box area, vertically centred on the logo
  if (isDuplicate) {
    const badgeW = 82;
    const badgeH = titleFontSize + 4;
    // Position: just to the left of where the TX ID box starts (tableR - 160 - 12)
    // Use PAGE_W - MARGIN - 160 - 12 as right boundary so it never overlaps the TX box
    const badgeX = PAGE_W - MARGIN - 160 - badgeW - 12;
    // Vertically centre on the logo midpoint (= arrow tip)
    const logoCentreY2 = contentY + 4 + logoH / 2;
    const badgeY = logoCentreY2 - badgeH / 2;
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fill("#cc2200");
    doc
      .fillColor("#ffffff")
      .fontSize(titleFontSize * 0.55)
      .font("Helvetica-Bold")
      .text("DUPLICATE", badgeX, badgeY + badgeH / 2 - titleFontSize * 0.55 * 0.36, {
        width: badgeW,
        align: "center",
        lineBreak: false,
      });
  }

  // Metadata fields — below the logo
  const metaY = contentY + 4 + logoH + 8;  // just below logo
  for (const f of metaFields) {
    doc
      .fillColor(GD_GRAY)
      .fontSize(6.5)
      .font("Helvetica")
      .text(f.label, f.x, metaY, { lineBreak: false });
    doc
      .fillColor(GD_DKGRAY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(f.value, f.x, metaY + 11, { lineBreak: false });
  }

  return metaY + 11 + 12 + 6;  // Y just below metadata values
}

// ─── Compact continuation header (page 2+) ────────────────────────────────────

function drawMiniHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle: string,
  logoPath: Buffer | null
): number {
  const contentY = TOP_BAR + GRN_BAR;
  const logoH = 34;
  let logoW = 0;
  if (logoPath) {
    try {
      doc.image(logoPath, MARGIN, contentY + 4, { height: logoH });
      logoW = logoH * 1.4;
    } catch { logoW = 0; }
  }

  const logoCentreY = contentY + 4 + logoH / 2;
  doc
    .fillColor(GD_NAVY)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(title, MARGIN + logoW + 16, logoCentreY - 7, { lineBreak: false });

  doc
    .fillColor(GD_GRAY)
    .fontSize(7.5)
    .font("Helvetica")
    .text(subtitle, MARGIN + logoW + 10 + 150, logoCentreY - 5, { lineBreak: false });

  const dividerY = contentY + 4 + logoH + 6;
  doc
    .moveTo(MARGIN, dividerY)
    .lineTo(PAGE_W - MARGIN, dividerY)
    .stroke(GD_BORDER);

  return dividerY + 8;
}

// ─── Table header row ─────────────────────────────────────────────────────────

interface ColSpec { label: string; x: number; align?: "left" | "right"; width?: number }

function drawTableHeaderRow(
  doc: PDFKit.PDFDocument,
  y: number,
  tableL: number,
  tableR: number,
  cols: ColSpec[]
): number {
  const h = 28;
  doc.roundedRect(tableL, y, tableR - tableL, h, 3).fill(GD_DKBLUE);

  doc.fillColor(WHITE).fontSize(7.5).font("Helvetica-Bold");
  for (const col of cols) {
    // Multi-word labels that wrap get vertically centered in the taller row
    const words = col.label.split(" ");
    const textY = words.length > 2 ? y + 5 : y + 10;
    const colW = col.width ?? 40;
    if (col.align === "right") {
      doc.text(col.label, col.x, textY, { width: colW, align: "right", lineBreak: false });
    } else {
      doc.text(col.label, col.x, textY, { lineBreak: false });
    }
  }
  return y + h;  // returns Y of first row
}

// ─── Total bar ────────────────────────────────────────────────────────────────

function drawTotalBar(
  doc: PDFKit.PDFDocument,
  label: string,
  total: number,
  tableL: number,
  tableR: number,
  y: number,
  /** Optional: left edge of the column the total should right-align under. Defaults to tableR-60. */
  totalColX?: number,
  /** Optional: width of the right-aligned total number block. Defaults to 40. */
  totalColW?: number
): number {
  const th = 22;
  const y2 = y + 4;
  doc.roundedRect(tableL, y2, tableR - tableL, th, 3).fill(TOTAL_BG);
  // Green left accent bar
  doc.roundedRect(tableL, y2, 4, th, 1).fill(GD_GREEN);

  doc
    .fillColor(GD_NAVY)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(label, tableL + 8, y2 + 7, { lineBreak: false });

  // Align total under the specified column, or fall back to right edge
  const numX = totalColX !== undefined ? totalColX : tableR - 60;
  const numW = totalColW ?? 40;
  doc
    .fillColor(GD_GREEN)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(String(total), numX, y2 + 5, { width: numW, align: "right", lineBreak: false });

  return y2 + th;
}

// ─── Sign-off section ─────────────────────────────────────────────────────────

function drawSignOff(
  doc: PDFKit.PDFDocument,
  y: number,
  tableL: number,
  fields: Array<{ label: string; x: number; lineWidth: number }>
) {
  const y2 = y + 18;
  const x = tableL + 4;

  doc
    .fillColor(GD_NAVY)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("SIGN-OFF", x, y2, { lineBreak: false });

  // Green underline below SIGN-OFF
  doc.rect(x, y2 + 12, 48, 2).fill(GD_GREEN);

  const lineY = y2 + 36;
  for (const f of fields) {
    doc
      .fillColor(GD_GRAY)
      .fontSize(6.5)
      .font("Helvetica")
      .text(f.label, f.x, lineY - 12, { lineBreak: false });
    doc
      .moveTo(f.x, lineY)
      .lineTo(f.x + f.lineWidth, lineY)
      .stroke(GD_BORDER);
  }
}

// ─── 1. PICK FACE PULL SHEET ──────────────────────────────────────────────────

export async function generatePickFacePullSheetPDF(
  res: Response | Writable,
  items: PullListItem[],
  meta: RunMeta
) {
  const logoPath = getLogoBuffer();
  // Barcode encodes the first order TX ID (or run ID if no orders)
  const firstOrderId = meta.orderIds?.[0] ?? meta.runId;
  const barcodeBuffer = await makeBarcodeBuffer(String(firstOrderId));
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margin: 0,
    autoFirstPage: true,
  });

  if ('setHeader' in res) {
    (res as Response).setHeader("Content-Type", "application/pdf");
    (res as Response).setHeader("Content-Disposition", `attachment; filename="pick-face-pull-sheet-run-${meta.runId}.pdf"`);
  }
  doc.pipe(res);

  const tableL = MARGIN - 4;
  const tableR = PAGE_W - MARGIN + 4;

  // Pick face items: ONLY direct picks from pick face locations
  // to_pick_face (warehouse→pick_face) movements belong on the warehouse sheet
  const pfItems = items.filter(
    (i) => i.fromLocationType === "pick_face"
  );

  const ROW_H = 26; // taller rows to accommodate optional 2nd line
  const ROWS_P1 = 22;
  const totalPages = pfItems.length <= ROWS_P1 ? 1 : 2;

  // Column x positions — FROM LOC | SKU | LOT # | ONHAND QTY | MOVE TO STAGING
  // Table width ~736pt; QTY_W=50 for onhand, DEST_W=90 for staging destination column
  const QTY_W  = 50;
  const DEST_W = 90;
  const cx = {
    from:    tableL + 4,           // FROM LOCATION (130pt wide)
    sku:     tableL + 4 + 130,     // SKU (165pt wide)
    lot:     tableL + 4 + 295,     // LOT # (100pt wide)
    unhand:  tableL + 4 + 395,     // ONHAND QTY — right edge at +445
    staging: tableL + 4 + 455,     // MOVE TO STAGING — right edge at +545
    chk:     tableR - 26,
  };

  const customerName = getCustomerName(meta);

  // ── Page 1 ──
  drawChrome(doc, 1, totalPages);
  let tableTop = drawFullHeader(doc, "PICK FACE PULL SHEET", logoPath, [
    { label: "CLIENT",    value: customerName,               x: MARGIN + 2 },
    { label: "WAREHOUSE", value: meta.facilityName ?? "—",   x: MARGIN + 180 },
    { label: "DATE",      value: formatDate(meta.createdAt), x: MARGIN + 340 },
  ], meta.isDuplicate);

  // TX ID box top-right — smaller box, shows order transaction IDs
  {
    const TXN_BOX_W = 160;
    const TXN_BOX_H = 60;
    const contentY = TOP_BAR + GRN_BAR;
    const headerAreaH = contentY + 4 + 44 + 8 + 11 + 12 + 6 - contentY;
    const bx = tableR - TXN_BOX_W;
    const by = contentY + (headerAreaH - TXN_BOX_H) / 2;
    doc.roundedRect(bx, by, TXN_BOX_W, TXN_BOX_H, 4).fillAndStroke(TXN_BG, GD_BLUE);
    doc.fillColor(GD_GRAY).fontSize(6).font("Helvetica")
      .text("TRANSACTION ID", bx, by + 6, { width: TXN_BOX_W, align: "center", lineBreak: false });
    // Show order IDs (up to 3, then +N more)
    const ids = meta.orderIds ?? [meta.runId];
    const displayIds = ids.length <= 3
      ? ids.join("  |  ")
      : ids.slice(0, 3).join("  |  ") + `  +${ids.length - 3}`;
    doc.fillColor(GD_NAVY).fontSize(ids.length === 1 ? 16 : 9).font("Helvetica-Bold")
      .text(displayIds, bx + 4, by + 17, { width: TXN_BOX_W - 8, align: "center", lineBreak: false });
    // Only show barcode when there is a single order ID
    if (barcodeBuffer && ids.length === 1) {
      const bcW = TXN_BOX_W - 16;
      const bcH = 20;
      doc.image(barcodeBuffer, bx + 8, by + TXN_BOX_H - bcH - 4, { width: bcW, height: bcH });
    }
  }

  if (pfItems.length === 0) {
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No pick face movements required.", tableL, tableTop + 20, { width: tableR - tableL, align: "center" });
    doc.end();
    return;
  }

  let rowY = drawTableHeaderRow(doc, tableTop, tableL, tableR, [
    { label: "FROM LOC.",       x: cx.from },
    { label: "SKU",             x: cx.sku },
    { label: "LOT #",           x: cx.lot },
    { label: "ONHAND QTY",      x: cx.unhand,  width: QTY_W,  align: "right" },
    { label: "MOVE TO STAGING", x: cx.staging, width: DEST_W, align: "right" },
  ]);

  const n1 = Math.min(pfItems.length, ROWS_P1);
  let totalQty = 0;

  for (let i = 0; i < n1; i++) {
    const item = pfItems[i]!;
    const y = rowY + i * ROW_H;

    // Alternating row background
    if (i % 2 === 1) {
      doc.rect(tableL, y, tableR - tableL, ROW_H).fill(ROW_ALT);
    }
    // Row bottom border
    doc.moveTo(tableL, y + ROW_H).lineTo(tableR, y + ROW_H).stroke(GD_BORDER);

    const textY = y + 7;

    // FROM location
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(item.fromLocationName, cx.from, textY, { width: 127, lineBreak: false });

    // SKU — navy bold
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY, { width: 162, lineBreak: false });

    // Lot #
    const lot = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
    doc.fillColor(lot === "-" ? GD_GRAY : GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(lot, cx.lot, textY, { width: 97, lineBreak: false });

    // Onhand qty — grey, right-aligned
    doc.fillColor(GD_GRAY).fontSize(9).font("Helvetica")
      .text(String(item.qty), cx.unhand, textY, { width: QTY_W, align: "right", lineBreak: false });

    // Move to Staging qty — bold navy; pick face items show a dash
    const totalReq = item.totalRequired ?? item.sourceQty;
    const stagingQty = item.movement !== "to_pick_face" ? (totalReq != null ? String(totalReq) : "—") : "—";
    doc.fillColor(stagingQty !== "—" ? GD_NAVY : GD_GRAY).fontSize(9).font(stagingQty !== "—" ? "Helvetica-Bold" : "Helvetica")
      .text(stagingQty, cx.staging, textY, { width: DEST_W, align: "right", lineBreak: false });

    // Checkbox
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);

    totalQty += item.qty;
  }

  const afterRows = rowY + n1 * ROW_H;

  if (totalPages === 1) {
    const afterTotal = drawTotalBar(doc, "TOTAL UNITS TO PICK", totalQty, tableL, tableR, afterRows, cx.staging, DEST_W);
    drawSignOff(doc, afterTotal, tableL, [
      { label: "PICKER NAME", x: tableL + 4, lineWidth: 340 },
    ]);
    doc.end();
    return;
  }

  // ── Page 2 ──
  doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
  drawChrome(doc, 2, totalPages);
  const mini2Y = drawMiniHeader(doc, "PICK FACE PULL SHEET", `Order: ${meta.runId}`, logoPath);
  let rowY2 = drawTableHeaderRow(doc, mini2Y, tableL, tableR, [
    { label: "FROM LOC.",       x: cx.from },
    { label: "SKU",             x: cx.sku },
    { label: "LOT #",           x: cx.lot },
    { label: "ONHAND QTY",      x: cx.unhand,  width: QTY_W,  align: "right" },
    { label: "MOVE TO STAGING", x: cx.staging, width: DEST_W, align: "right" },
  ]);

  const rest = pfItems.slice(ROWS_P1);
  for (let j = 0; j < rest.length; j++) {
    const item = rest[j]!;
    const y = rowY2 + j * ROW_H;
    const globalIdx = ROWS_P1 + j;

    if (globalIdx % 2 === 1) {
      doc.rect(tableL, y, tableR - tableL, ROW_H).fill(ROW_ALT);
    }
    doc.moveTo(tableL, y + ROW_H).lineTo(tableR, y + ROW_H).stroke(GD_BORDER);

    const textY2 = y + 7;
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(item.fromLocationName, cx.from, textY2, { width: 127, lineBreak: false });
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY2, { width: 162, lineBreak: false });

    const lot2 = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
    doc.fillColor(lot2 === "-" ? GD_GRAY : GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(lot2, cx.lot, textY2, { width: 97, lineBreak: false });
    doc.fillColor(GD_GRAY).fontSize(9).font("Helvetica")
      .text(String(item.qty), cx.unhand, textY2, { width: QTY_W, align: "right", lineBreak: false });
    const totalReq2 = item.totalRequired ?? item.sourceQty;
    const stagingQty2 = item.movement !== "to_pick_face" ? (totalReq2 != null ? String(totalReq2) : "—") : "—";
    doc.fillColor(stagingQty2 !== "—" ? GD_NAVY : GD_GRAY).fontSize(9).font(stagingQty2 !== "—" ? "Helvetica-Bold" : "Helvetica")
      .text(stagingQty2, cx.staging, textY2, { width: DEST_W, align: "right", lineBreak: false });
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);
  }

  const after2 = rowY2 + rest.length * ROW_H;
  const afterTotal2 = drawTotalBar(doc, "TOTAL UNITS TO PICK", totalQty, tableL, tableR, after2, cx.staging, DEST_W);
  drawSignOff(doc, afterTotal2, tableL, [
    { label: "PICKER NAME", x: tableL + 4, lineWidth: 340 },
  ]);

  doc.end();
}

// ─── 2. WAREHOUSE PULL SHEET ──────────────────────────────────────────────────

export async function generateWarehousePullSheetPDF(
  res: Response | Writable,
  items: PullListItem[],
  meta: RunMeta
) {
  const logoPath = getLogoBuffer();
  // Barcode encodes the first order TX ID (or run ID if no orders)
  const firstOrderIdWh = meta.orderIds?.[0] ?? meta.runId;
  const barcodeBuffer = await makeBarcodeBuffer(String(firstOrderIdWh));
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margin: 0,
    autoFirstPage: true,
  });

  if ('setHeader' in res) {
    (res as Response).setHeader("Content-Type", "application/pdf");
    (res as Response).setHeader("Content-Disposition", `attachment; filename="warehouse-pull-sheet-run-${meta.runId}.pdf"`);
  }
  doc.pipe(res);

  const tableL = MARGIN - 4;
  const tableR = PAGE_W - MARGIN + 4;
  const ROW_H  = 26;

  // Warehouse items only, sorted ascending by source location name
  const whItems = items
    .filter((i) => i.fromLocationType === "warehouse")
    .sort((a, b) => a.fromLocationName.localeCompare(b.fromLocationName));

  // Column x positions — FROM LOC | SKU | LOT # | ONHAND QTY | MOVE TO STAGING | MOVE TO PICK FACE
  const QTY_W_WH = 50;
  const DEST_W_WH = 65;
  const cx = {
    from:     tableL + 4,           // FROM LOCATION (130pt wide)
    sku:      tableL + 4 + 130,     // SKU (165pt wide)
    lot:      tableL + 4 + 295,     // LOT # (100pt wide)
    unhand:   tableL + 4 + 395,     // ONHAND QTY — right edge at +445
    staging:  tableL + 4 + 455,     // MOVE TO STAGING — right edge at +520
    pickFace: tableL + 4 + 530,     // MOVE TO PICK FACE — right edge at +595
    chk:      tableR - 26,
  };

  const customerName = getCustomerName(meta);

  drawChrome(doc, 1, 1);
  const tableTop = drawFullHeader(doc, "WAREHOUSE PULL SHEET", logoPath, [
    { label: "CLIENT",    value: customerName,               x: MARGIN + 2 },
    { label: "WAREHOUSE", value: meta.facilityName ?? "—",   x: MARGIN + 180 },
    { label: "DATE",      value: formatDate(meta.createdAt), x: MARGIN + 340 },
  ], meta.isDuplicate);

  // TX ID box top-right — smaller box, shows order transaction IDs
  {
    const TXN_BOX_W = 160;
    const TXN_BOX_H = 60;
    const contentY = TOP_BAR + GRN_BAR;
    const headerAreaH = contentY + 4 + 44 + 8 + 11 + 12 + 6 - contentY;
    const bx = tableR - TXN_BOX_W;
    const by = contentY + (headerAreaH - TXN_BOX_H) / 2;
    doc.roundedRect(bx, by, TXN_BOX_W, TXN_BOX_H, 4).fillAndStroke(TXN_BG, GD_BLUE);
    doc.fillColor(GD_GRAY).fontSize(6).font("Helvetica")
      .text("TRANSACTION ID", bx, by + 6, { width: TXN_BOX_W, align: "center", lineBreak: false });
    const idsWh = meta.orderIds ?? [meta.runId];
    const displayIdsWh = idsWh.length <= 3
      ? idsWh.join("  |  ")
      : idsWh.slice(0, 3).join("  |  ") + `  +${idsWh.length - 3}`;
    doc.fillColor(GD_NAVY).fontSize(idsWh.length === 1 ? 16 : 9).font("Helvetica-Bold")
      .text(displayIdsWh, bx + 4, by + 17, { width: TXN_BOX_W - 8, align: "center", lineBreak: false });
    // Only show barcode when there is a single order ID
    if (barcodeBuffer && idsWh.length === 1) {
      const bcW = TXN_BOX_W - 16;
      const bcH = 20;
      doc.image(barcodeBuffer, bx + 8, by + TXN_BOX_H - bcH - 4, { width: bcW, height: bcH });
    }
  }

  if (whItems.length === 0) {
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No warehouse movements required.", tableL, tableTop + 20, { width: tableR - tableL, align: "center" });
    doc.end();
    return;
  }

  let rowY = drawTableHeaderRow(doc, tableTop, tableL, tableR, [
    { label: "FROM LOCATION",    x: cx.from },
    { label: "SKU",              x: cx.sku },
    { label: "LOT #",            x: cx.lot },
    { label: "ONHAND QTY",       x: cx.unhand,   width: QTY_W_WH,  align: "right" },
    { label: "MOVE TO STAGING",  x: cx.staging,  width: DEST_W_WH, align: "right" },
    { label: "MOVE TO PICK FACE",x: cx.pickFace, width: DEST_W_WH, align: "right" },
  ]);

  let totalOnhand = 0;
  let totalToStaging = 0;
  let totalToPickFace = 0;

  for (let i = 0; i < whItems.length; i++) {
    const item = whItems[i]!;
    const y = rowY + i * ROW_H;

    if (i % 2 === 1) {
      doc.rect(tableL, y, tableR - tableL, ROW_H).fill(ROW_ALT);
    }
    doc.moveTo(tableL, y + ROW_H).lineTo(tableR, y + ROW_H).stroke(GD_BORDER);

    const textY = y + ROW_H / 2 - 4;

    // From location
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(item.fromLocationName, cx.from, textY, { width: 127, lineBreak: false });

    // SKU — navy bold
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY, { width: 162, lineBreak: false });

    // Lot #
    const lot = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
    doc.fillColor(lot === "-" ? GD_GRAY : GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(lot, cx.lot, textY, { width: 97, lineBreak: false });

    // Onhand qty — grey
    doc.fillColor(GD_GRAY).fontSize(9).font("Helvetica")
      .text(String(item.qty), cx.unhand, textY, { width: QTY_W_WH, align: "right", lineBreak: false });

    // Move to Staging / Move to Pick Face — split by movement type
    const totalReq = item.totalRequired ?? item.sourceQty;
    const isPickFaceDest = item.movement === "to_pick_face" ||
      (item.toLocationName && /^ACR/i.test(item.toLocationName));
    const stagingQtyWh  = !isPickFaceDest ? (totalReq != null ? String(totalReq) : "—") : "—";
    const pickFaceQtyWh = isPickFaceDest  ? (totalReq != null ? String(totalReq) : "—") : "—";
    doc.fillColor(stagingQtyWh !== "—" ? GD_NAVY : GD_GRAY).fontSize(9).font(stagingQtyWh !== "—" ? "Helvetica-Bold" : "Helvetica")
      .text(stagingQtyWh, cx.staging, textY, { width: DEST_W_WH, align: "right", lineBreak: false });
    doc.fillColor(pickFaceQtyWh !== "—" ? GD_GREEN : GD_GRAY).fontSize(9).font(pickFaceQtyWh !== "—" ? "Helvetica-Bold" : "Helvetica")
      .text(pickFaceQtyWh, cx.pickFace, textY, { width: DEST_W_WH, align: "right", lineBreak: false });

    // Checkbox
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);

    totalOnhand += item.qty;
    const reqWh = item.totalRequired ?? item.sourceQty ?? 0;
    const isPickFaceDestWh = item.movement === "to_pick_face" ||
      (item.toLocationName && /^ACR/i.test(item.toLocationName));
    if (isPickFaceDestWh) totalToPickFace += reqWh;
    else totalToStaging += reqWh;
  }

  // ── Three-column total bar ────────────────────────────────────────────────────
  // Draw a single green total bar with three right-aligned numbers under their columns
  const afterRows = rowY + whItems.length * ROW_H;
  {
    const th = 22;
    const y2 = afterRows + 4;
    doc.roundedRect(tableL, y2, tableR - tableL, th, 3).fill(TOTAL_BG);
    doc.roundedRect(tableL, y2, 4, th, 1).fill(GD_GREEN);
    doc.fillColor(GD_NAVY).fontSize(9).font("Helvetica-Bold")
      .text("TOTALS", tableL + 8, y2 + 7, { lineBreak: false });
    // Onhand total
    doc.fillColor(GD_GRAY).fontSize(11).font("Helvetica-Bold")
      .text(String(totalOnhand), cx.unhand, y2 + 5, { width: QTY_W_WH, align: "right", lineBreak: false });
    // Staging total
    doc.fillColor(GD_GREEN).fontSize(13).font("Helvetica-Bold")
      .text(String(totalToStaging), cx.staging, y2 + 5, { width: DEST_W_WH, align: "right", lineBreak: false });
    // Pick face total
    doc.fillColor(GD_GREEN).fontSize(13).font("Helvetica-Bold")
      .text(String(totalToPickFace), cx.pickFace, y2 + 5, { width: DEST_W_WH, align: "right", lineBreak: false });
    const afterTotal = y2 + th;
    drawSignOff(doc, afterTotal, tableL, [
      { label: "PICKER NAME", x: tableL + 4, lineWidth: 340 },
    ]);
  }

  doc.end();
}

// ─── 3. PACK SHEET ────────────────────────────────────────────────────────────

export async function generatePackListPDF(
  res: Response | Writable,
  orders: OrderPackData[],
  meta: RunMeta
) {
  const barcodeMap = new Map<number, Buffer | null>();
  await Promise.all(orders.map(async (o) => {
    barcodeMap.set(o.orderId, await makeBarcodeBuffer(String(o.orderId)));
  }));

  const logoPath = getLogoBuffer();
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margin: 0,
    autoFirstPage: true,
  });

  if ('setHeader' in res) {
    (res as Response).setHeader("Content-Type", "application/pdf");
    (res as Response).setHeader("Content-Disposition", `attachment; filename="pack-sheet-run-${meta.runId}.pdf"`);
  }
  doc.pipe(res);

  const tableL = MARGIN - 4;
  const tableR = MARGIN + 714;
  const ROW_H  = 20;
  const TXN_BOX_W = 160;
  const TXN_BOX_H = 60;

  // Column x positions (matching Python CX)
  const cx = {
    location: MARGIN + 2,
    sku:      MARGIN + 90,
    desc:     MARGIN + 234,
    lot:      MARGIN + 530,
    qty:      MARGIN + 618,
    check:    MARGIN + 662,
  };

  if (orders.length === 0) {
    drawChrome(doc, 1, 1);
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No items to pack.", tableL, 200, { width: tableR - tableL, align: "center" });
    doc.end();
    return;
  }

  const customerName = getCustomerName(meta);

  for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
    const order = orders[orderIdx]!;
    if (orderIdx > 0) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    }

    const ROWS_P1 = 18;
    const totalPages = order.items.length <= ROWS_P1 ? 1 : Math.ceil((order.items.length - ROWS_P1) / 22) + 1;

    // ── Page 1 header ──────────────────────────────────────────────────────
    drawChrome(doc, 1, totalPages);

    const contentY = TOP_BAR + GRN_BAR;  // ~19

    // Logo
    const logoH = 46;
    let logoW = 0;
    if (logoPath) {
      try {
        doc.image(logoPath, MARGIN, contentY + 4, { height: logoH });
        logoW = logoH * 1.4;
      } catch { logoW = 0; }
    }

    // Title
    const titleFontSize = logoH / 2;
    const logoCentreY = contentY + 4 + logoH / 2;
    const capH = titleFontSize * 0.72;
    const titleY = logoCentreY - capH / 2;
    const packTitleX = MARGIN + logoW + 36;  // 36pt gap between logo right edge and first letter
    doc.fillColor(GD_NAVY).fontSize(titleFontSize).font("Helvetica-Bold")
      .text("PACK SHEET", packTitleX, titleY, { lineBreak: false });

    // DUPLICATE badge — shown when reprinting
    // Placed to the left of the TX ID box, vertically centred on the logo midpoint
    if (meta.isDuplicate) {
      const badgeW = 82;
      const badgeH = titleFontSize + 4;
      const badgeX = tableR - TXN_BOX_W - badgeW - 12;
      const logoCentreY2 = contentY + 4 + logoH / 2;
      const badgeY = logoCentreY2 - badgeH / 2;
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fill("#cc2200");
      doc.fillColor("#ffffff").fontSize(titleFontSize * 0.55).font("Helvetica-Bold")
        .text("DUPLICATE", badgeX, badgeY + badgeH / 2 - titleFontSize * 0.55 * 0.36, {
          width: badgeW, align: "center", lineBreak: false,
        });
    }

    // Transaction ID box (top-right, vertically centred in header area)
    const headerAreaH = contentY + 4 + logoH + 8 + 11 + 12 + 6 - contentY;  // full header height
    const bx = tableR - TXN_BOX_W;
    const by = contentY + (headerAreaH - TXN_BOX_H) / 2;

    doc.roundedRect(bx, by, TXN_BOX_W, TXN_BOX_H, 5).fillAndStroke(TXN_BG, GD_BLUE);

    doc.fillColor(GD_GRAY).fontSize(6).font("Helvetica")
      .text("TRANSACTION ID", bx, by + 6, { width: TXN_BOX_W, align: "center", lineBreak: false });

    doc.fillColor(GD_NAVY).fontSize(16).font("Helvetica-Bold")
      .text(String(order.orderId), bx, by + 16, { width: TXN_BOX_W, align: "center", lineBreak: false });

    // Barcode
    const barcodeBuffer = barcodeMap.get(order.orderId);
    if (barcodeBuffer) {
      const bcW = TXN_BOX_W - 16;
      const bcH = 18;
      doc.image(barcodeBuffer, bx + 8, by + TXN_BOX_H - bcH - 4, { width: bcW, height: bcH });
    }

    // Metadata: CLIENT | SHIP TO
    const metaY = contentY + 4 + logoH + 8;
    const metaFields = [
      { label: "CLIENT",  value: customerName,                                  x: MARGIN + 2 },
      { label: "SHIP TO", value: order.shipToName ?? order.referenceNum ?? "—", x: MARGIN + 220 },
    ];
    for (const f of metaFields) {
      doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
        .text(f.label, f.x, metaY, { lineBreak: false });
      doc.fillColor(GD_DKGRAY).fontSize(9.5).font("Helvetica-Bold")
        .text(f.value, f.x, metaY + 11, { lineBreak: false });
    }

    let tableTop = metaY + 11 + 12 + 6;

    // ── Table header ──────────────────────────────────────────────────────
    const drawPackTableHeader = (y: number): number => {
      doc.roundedRect(tableL, y, tableR - tableL, 21, 3).fill(GD_DKBLUE);
      doc.fillColor(WHITE).fontSize(7).font("Helvetica-Bold");
      doc.text("LOCATION",    cx.location, y + 7, { lineBreak: false });
      doc.text("SKU",         cx.sku,      y + 7, { lineBreak: false });
      doc.text("DESCRIPTION", cx.desc,     y + 7, { lineBreak: false });
      doc.text("LOT #",       cx.lot,      y + 7, { lineBreak: false });
      doc.text("QTY",         cx.qty,      y + 7, { width: 36, align: "right", lineBreak: false });
      return y + 21;
    };

    // ── Row drawing helper ─────────────────────────────────────────────────
    const drawPackRow = (item: PackListItem, globalIdx: number, y: number) => {
      if (globalIdx % 2 === 1) {
        doc.rect(tableL, y, tableR - tableL, ROW_H).fill(ROW_ALT);
      }
      doc.moveTo(tableL, y + ROW_H).lineTo(tableR, y + ROW_H).stroke(GD_BORDER);

      // Location — navy bold for STAGING, green for ACR face locations
      const isStaging = item.locationName.toUpperCase() === "STAGING";
      const locColor = isStaging ? GD_NAVY : GD_GREEN;
      if (item.dropLocation) {
        doc.fillColor(locColor).fontSize(8).font("Helvetica-Bold")
          .text(item.locationName, cx.location, y + 4, { lineBreak: false });
        doc.fillColor(GD_GRAY).fontSize(5.5).font("Helvetica")
          .text(`Drop: ${item.dropLocation}`, cx.location, y + 13, { lineBreak: false });
      } else {
        doc.fillColor(locColor).fontSize(8).font("Helvetica-Bold")
          .text(item.locationName, cx.location, y + ROW_H / 2 - 4, { lineBreak: false });
      }

      // SKU
      doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
        .text(item.sku, cx.sku, y + ROW_H / 2 - 4, { lineBreak: false });

      // Description (truncate to ~54 chars)
      const desc = item.description ?? "—";
      const descTrunc = desc.length > 54 ? desc.slice(0, 53) + "…" : desc;
      doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
        .text(descTrunc, cx.desc, y + ROW_H / 2 - 4, { lineBreak: false });

      // Lot #
      const lot = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
      doc.fillColor(lot === "-" ? GD_GRAY : GD_DKGRAY).fontSize(7.5).font("Helvetica")
        .text(lot, cx.lot, y + ROW_H / 2 - 4, { lineBreak: false });

      // Qty
      doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
        .text(String(item.qty), cx.qty, y + ROW_H / 2 - 5, { width: 36, align: "right", lineBreak: false });

      // Checkbox
      doc.roundedRect(cx.check + 12, y + ROW_H / 2 - 7, 13, 13, 2).fillAndStroke(WHITE, GD_BORDER);
    };

    let rowY = drawPackTableHeader(tableTop);

    const n1 = Math.min(order.items.length, ROWS_P1);
    let totalQty = 0;

    for (let i = 0; i < n1; i++) {
      drawPackRow(order.items[i]!, i, rowY + i * ROW_H);
      totalQty += order.items[i]!.qty;
    }

    if (totalPages === 1) {
      const afterRows = rowY + n1 * ROW_H;
      const afterTotal = drawTotalBar(doc, "TOTAL UNITS", totalQty, tableL, tableR, afterRows, cx.qty, 36);
      drawSignOff(doc, afterTotal, tableL, [
        { label: "PICKER NAME",   x: MARGIN + 4,       lineWidth: 210 },
        { label: "QC NAME",       x: MARGIN + 4 + 250, lineWidth: 210 },
        { label: "TOTAL PALLETS", x: MARGIN + 4 + 510, lineWidth: 110 },
      ]);
      continue;
    }

    // ── Page 2+ ───────────────────────────────────────────────────────────
    const rest = order.items.slice(ROWS_P1);
    let pageNum = 2;
    let chunkStart = 0;
    const ROWS_PER_PAGE = 22;

    while (chunkStart < rest.length) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      drawChrome(doc, pageNum, totalPages);
      const miniY = drawMiniHeader(doc, "PACK SHEET", `ID: ${order.orderId}`, logoPath);
      let rowY2 = drawPackTableHeader(miniY);

      const chunk = rest.slice(chunkStart, chunkStart + ROWS_PER_PAGE);
      const isLastChunk = chunkStart + ROWS_PER_PAGE >= rest.length;

      for (let j = 0; j < chunk.length; j++) {
        const globalIdx = ROWS_P1 + chunkStart + j;
        drawPackRow(chunk[j]!, globalIdx, rowY2 + j * ROW_H);
        totalQty += chunk[j]!.qty;
      }

      if (isLastChunk) {
        const afterRows2 = rowY2 + chunk.length * ROW_H;
        const afterTotal2 = drawTotalBar(doc, "TOTAL UNITS", totalQty, tableL, tableR, afterRows2, cx.qty, 36);
        drawSignOff(doc, afterTotal2, tableL, [
          { label: "PICKER NAME",   x: MARGIN + 4,       lineWidth: 210 },
          { label: "QC NAME",       x: MARGIN + 4 + 250, lineWidth: 210 },
          { label: "TOTAL PALLETS", x: MARGIN + 4 + 510, lineWidth: 110 },
        ]);
      }

      chunkStart += ROWS_PER_PAGE;
      pageNum++;
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
  generatePickFacePullSheetPDF(res, items, meta);
}
