import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import type { Response } from "express";
import type { Writable } from "stream";

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

function getLogoPath(): string | null {
  const p = path.resolve("/home/ubuntu/webdev-static-assets/gd_icon_only.jpg");
  return fs.existsSync(p) ? p : null;
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
  logoPath: string | null,
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
  if (isDuplicate) {
    // Use a generous per-character width so the badge always clears the title
    // Helvetica-Bold at titleFontSize: avg char width ≈ 0.62 × fontSize
    const approxTitleW = title.length * titleFontSize * 0.62;
    const badgeX = titleX + approxTitleW + 14;
    const badgeY = titleY - 2;
    const badgeW = 82;
    const badgeH = titleFontSize + 4;
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
  logoPath: string | null
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

interface ColSpec { label: string; x: number; align?: "left" | "right" }

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
    if (col.align === "right") {
      doc.text(col.label, col.x - 40, textY, { width: 40, align: "right", lineBreak: false });
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
  y: number
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

  doc
    .fillColor(GD_GREEN)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(String(total), tableR - 60, y2 + 5, { width: 56, align: "right", lineBreak: false });

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
  const logoPath = getLogoPath();
  const barcodeBuffer = await makeBarcodeBuffer(String(meta.runId));
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

  // Filter to pick-face items only
  const pfItems = items.filter(
    (i) => i.fromLocationType === "pick_face" || i.movement === "to_staging"
  );

  const ROW_H = 22;
  const ROWS_P1 = 22;
  const totalPages = pfItems.length <= ROWS_P1 ? 1 : 2;

  // Column x positions (matching Python _pf_cols)
  const cx = {
    face: tableL + 4,
    sku:  tableL + 4 + 120,
    lot:  tableL + 4 + 420,
    qty:  tableL + 4 + 570,
    chk:  tableR - 26,
  };

  const customerName = getCustomerName(meta);

  // ── Page 1 ──
  drawChrome(doc, 1, totalPages);
  let tableTop = drawFullHeader(doc, "PICK FACE PULL SHEET", logoPath, [
    { label: "CLIENT",    value: customerName,               x: MARGIN + 2 },
    { label: "WAREHOUSE", value: meta.facilityName ?? "—",   x: MARGIN + 180 },
    { label: "DATE",      value: formatDate(meta.createdAt), x: MARGIN + 340 },
  ], meta.isDuplicate);

  // TX ID box top-right (matching Pack Sheet style)
  {
    const TXN_BOX_W = 180;
    const TXN_BOX_H = 80;
    const contentY = TOP_BAR + GRN_BAR;
    const headerAreaH = contentY + 4 + 44 + 8 + 11 + 12 + 6 - contentY;
    const bx = tableR - TXN_BOX_W;
    const by = contentY + (headerAreaH - TXN_BOX_H) / 2;
    doc.roundedRect(bx, by, TXN_BOX_W, TXN_BOX_H, 5).fillAndStroke(TXN_BG, GD_BLUE);
    doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
      .text("RUN / ORDER REF", bx, by + 8, { width: TXN_BOX_W, align: "center", lineBreak: false });
    doc.fillColor(GD_NAVY).fontSize(20).font("Helvetica-Bold")
      .text(String(meta.runId), bx, by + 22, { width: TXN_BOX_W, align: "center", lineBreak: false });
    if (barcodeBuffer) {
      const bcW = TXN_BOX_W - 20;
      const bcH = 24;
      doc.image(barcodeBuffer, bx + 10, by + TXN_BOX_H - bcH - 4, { width: bcW, height: bcH });
    }
  }

  if (pfItems.length === 0) {
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No pick face movements required.", tableL, tableTop + 20, { width: tableR - tableL, align: "center" });
    doc.end();
    return;
  }

  let rowY = drawTableHeaderRow(doc, tableTop, tableL, tableR, [
    { label: "LOCATION",    x: cx.face },
    { label: "SKU",         x: cx.sku },
    { label: "LOT #",       x: cx.lot },
    { label: "QTY TO PICK", x: cx.qty + 40, align: "right" },
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

    const textY = y + ROW_H / 2 - 4;

    // Face location — green bold
    doc.fillColor(GD_GREEN).fontSize(8.5).font("Helvetica-Bold")
      .text(item.fromLocationName, cx.face, textY, { lineBreak: false });

    // SKU — navy bold
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY, { lineBreak: false });

    // Lot #
    const lot = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
    doc.fillColor(lot === "-" ? GD_GRAY : GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(lot, cx.lot, textY, { lineBreak: false });

    // Qty — right-aligned bold
    doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
      .text(String(item.qty), cx.qty, textY, { width: 40, align: "right", lineBreak: false });

    // Checkbox
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);

    totalQty += item.qty;
  }

  const afterRows = rowY + n1 * ROW_H;

  if (totalPages === 1) {
    const afterTotal = drawTotalBar(doc, "TOTAL UNITS TO PICK", totalQty, tableL, tableR, afterRows);
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
    { label: "LOCATION",    x: cx.face },
    { label: "SKU",         x: cx.sku },
    { label: "LOT #",       x: cx.lot },
    { label: "QTY TO PICK", x: cx.qty + 40, align: "right" },
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

    const textY = y + ROW_H / 2 - 4;
    doc.fillColor(GD_GREEN).fontSize(8.5).font("Helvetica-Bold")
      .text(item.fromLocationName, cx.face, textY, { lineBreak: false });
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY, { lineBreak: false });

    const lot = item.lotNumber && item.lotNumber !== "0" ? item.lotNumber : "-";
    doc.fillColor(lot === "-" ? GD_GRAY : GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(lot, cx.lot, textY, { lineBreak: false });
    doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
      .text(String(item.qty), cx.qty, textY, { width: 40, align: "right", lineBreak: false });
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);
  }

  const after2 = rowY2 + rest.length * ROW_H;
  const afterTotal2 = drawTotalBar(doc, "TOTAL UNITS TO PICK", totalQty, tableL, tableR, after2);
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
  const logoPath = getLogoPath();
  const barcodeBuffer = await makeBarcodeBuffer(String(meta.runId));
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

  const whItems = items.filter((i) => i.fromLocationType === "warehouse");

  // Column x positions (matching Python _wh_cols)
  const cx = {
    sku:    tableL + 4,
    from:   tableL + 4 + 140,
    to:     tableL + 4 + 270,
    qty:    tableL + 4 + 370,
    req:    tableL + 4 + 460,
    orders: tableL + 4 + 550,
    chk:    tableR - 26,
  };

  const customerName = getCustomerName(meta);

  drawChrome(doc, 1, 1);
  const tableTop = drawFullHeader(doc, "WAREHOUSE PULL SHEET", logoPath, [
    { label: "CLIENT",    value: customerName,               x: MARGIN + 2 },
    { label: "WAREHOUSE", value: meta.facilityName ?? "—",   x: MARGIN + 180 },
    { label: "DATE",      value: formatDate(meta.createdAt), x: MARGIN + 340 },
  ], meta.isDuplicate);

  // TX ID box top-right (matching Pack Sheet style)
  {
    const TXN_BOX_W = 180;
    const TXN_BOX_H = 80;
    const contentY = TOP_BAR + GRN_BAR;
    const headerAreaH = contentY + 4 + 44 + 8 + 11 + 12 + 6 - contentY;
    const bx = tableR - TXN_BOX_W;
    const by = contentY + (headerAreaH - TXN_BOX_H) / 2;
    doc.roundedRect(bx, by, TXN_BOX_W, TXN_BOX_H, 5).fillAndStroke(TXN_BG, GD_BLUE);
    doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
      .text("RUN / ORDER REF", bx, by + 8, { width: TXN_BOX_W, align: "center", lineBreak: false });
    doc.fillColor(GD_NAVY).fontSize(20).font("Helvetica-Bold")
      .text(String(meta.runId), bx, by + 22, { width: TXN_BOX_W, align: "center", lineBreak: false });
    if (barcodeBuffer) {
      const bcW = TXN_BOX_W - 20;
      const bcH = 24;
      doc.image(barcodeBuffer, bx + 10, by + TXN_BOX_H - bcH - 4, { width: bcW, height: bcH });
    }
  }

  if (whItems.length === 0) {
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No warehouse movements required.", tableL, tableTop + 20, { width: tableR - tableL, align: "center" });
    doc.end();
    return;
  }

  let rowY = drawTableHeaderRow(doc, tableTop, tableL, tableR, [
    { label: "SKU",              x: cx.sku },
    { label: "FROM LOCATION",    x: cx.from },
    { label: "TO LOCATION",      x: cx.to },
    { label: "QTY TO PULL",      x: cx.qty },
    { label: "TOTAL REQ.",       x: cx.req },
    { label: "AFFECTED ORDERS",  x: cx.orders },
  ]);

  let totalQty = 0;

  for (let i = 0; i < whItems.length; i++) {
    const item = whItems[i]!;
    const y = rowY + i * ROW_H;

    if (i % 2 === 1) {
      doc.rect(tableL, y, tableR - tableL, ROW_H).fill(ROW_ALT);
    }
    doc.moveTo(tableL, y + ROW_H).lineTo(tableR, y + ROW_H).stroke(GD_BORDER);

    const textY = y + ROW_H / 2 - 4;

    // SKU — navy bold
    doc.fillColor(GD_NAVY).fontSize(8.5).font("Helvetica-Bold")
      .text(item.sku, cx.sku, textY, { lineBreak: false });

    // From location
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(item.fromLocationName, cx.from, textY, { lineBreak: false });

    // To location — green if pick face (ACR*), gray if STAGING
    const isPickFaceDest = item.movement === "to_pick_face" ||
      (item.toLocationName && /^ACR/i.test(item.toLocationName));
    const toLabel = isPickFaceDest ? item.toLocationName : "STAGING";
    doc.fillColor(isPickFaceDest ? GD_GREEN : GD_GRAY).fontSize(8).font("Helvetica-Bold")
      .text(toLabel, cx.to, textY, { lineBreak: false });

    // Qty to pull — bold
    doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
      .text(String(item.qty), cx.qty, textY, { lineBreak: false });

    // Total req — muted
    const totalReq = item.totalRequired ?? item.sourceQty;
    doc.fillColor(GD_GRAY).fontSize(8).font("Helvetica")
      .text(totalReq != null ? String(totalReq) : "—", cx.req, textY, { lineBreak: false });

    // Affected orders
    const affectedText = item.affectedOrderIds?.length
      ? item.affectedOrderIds.map((id) => String(id)).join(", ")
      : "—";
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica")
      .text(affectedText, cx.orders, textY, { lineBreak: false });

    // Checkbox
    doc.roundedRect(cx.chk, y + ROW_H / 2 - 7, 14, 14, 2).fillAndStroke(WHITE, GD_BORDER);

    totalQty += item.qty;
  }

  const afterRows = rowY + whItems.length * ROW_H;
  const afterTotal = drawTotalBar(doc, "TOTAL UNITS TO PULL", totalQty, tableL, tableR, afterRows);
  drawSignOff(doc, afterTotal, tableL, [
    { label: "PICKER NAME", x: tableL + 4, lineWidth: 340 },
  ]);

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

  const logoPath = getLogoPath();
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
  const TXN_BOX_W = 210;
  const TXN_BOX_H = 90;

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
    if (meta.isDuplicate) {
      const approxTitleW = "PACK SHEET".length * titleFontSize * 0.62;
      const badgeX = packTitleX + approxTitleW + 14;
      const badgeY = titleY - 2;
      const badgeW = 82;
      const badgeH = titleFontSize + 4;
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

    doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
      .text("TRANSACTION ID", bx, by + 8, { width: TXN_BOX_W, align: "center", lineBreak: false });

    doc.fillColor(GD_NAVY).fontSize(20).font("Helvetica-Bold")
      .text(String(order.orderId), bx, by + 22, { width: TXN_BOX_W, align: "center", lineBreak: false });

    // Barcode
    const barcodeBuffer = barcodeMap.get(order.orderId);
    if (barcodeBuffer) {
      const bcW = TXN_BOX_W - 20;
      const bcH = 28;
      doc.image(barcodeBuffer, bx + 10, by + TXN_BOX_H - bcH - 6, { width: bcW, height: bcH });
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
      const afterTotal = drawTotalBar(doc, "TOTAL UNITS", totalQty, tableL, tableR, afterRows);
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
        const afterTotal2 = drawTotalBar(doc, "TOTAL UNITS", totalQty, tableL, tableR, afterRows2);
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
