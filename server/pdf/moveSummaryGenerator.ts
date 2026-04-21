import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { Writable } from "stream";
import { GD_LOGO_B64 } from "./logo";
import type { PullListItem, RunMeta } from "./generator";

// ─── Brand colours ────────────────────────────────────────────────────────────
const GD_DKBLUE = "#15527f";
const GD_NAVY   = "#0e3a5a";
const GD_GREEN  = "#37A400";
const GD_GRAY   = "#a6a8ab";
const GD_DKGRAY = "#333333";
const GD_LTGRAY = "#F4F6F8";
const GD_BORDER = "#CDD4DC";
const ROW_ALT   = "#EEF4FB";
const TOTAL_BG  = "#EDFAEB";
const WHITE     = "#ffffff";

// ─── Page constants ───────────────────────────────────────────────────────────
const PAGE_W  = 792;
const PAGE_H  = 612;
const MARGIN  = 0.44 * 72;
const TOP_BAR = 16;
const GRN_BAR = 3;
const FOOTER_H = 24;

function getLogoBuffer(): Buffer {
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

interface ColSpec { label: string; x: number; align?: "left" | "right"; width?: number }

function drawChrome(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  doc.rect(0, 0, PAGE_W, TOP_BAR).fill(GD_DKBLUE);
  doc.rect(0, TOP_BAR, PAGE_W, GRN_BAR).fill(GD_GREEN);
  const footerY = PAGE_H - FOOTER_H;
  doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(GD_LTGRAY);
  doc.moveTo(0, footerY).lineTo(PAGE_W, footerY).stroke(GD_BORDER);
  doc.fillColor(GD_GRAY).fontSize(7).font("Helvetica")
    .text("Go Direct Wizard", 0, footerY + 8, { width: PAGE_W, align: "center", lineBreak: false });
  doc.fillColor(GD_GRAY).fontSize(7).font("Helvetica")
    .text(`${pageNum} of ${totalPages}`, MARGIN, footerY + 8, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });
}

function drawFullHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  logoPath: Buffer | null,
  metaFields: Array<{ label: string; value: string; x: number }>
): number {
  const contentY = TOP_BAR + GRN_BAR;
  const logoH = 44;
  let logoW = 0;
  if (logoPath) {
    try { doc.image(logoPath, MARGIN, contentY + 4, { height: logoH }); logoW = logoH * 1.4; }
    catch { logoW = 0; }
  }
  const titleFontSize = logoH / 2;
  const logoCentreY = contentY + 4 + logoH / 2;
  const capH = titleFontSize * 0.72;
  const titleY = logoCentreY - capH / 2;
  doc.fillColor(GD_NAVY).fontSize(titleFontSize).font("Helvetica-Bold")
    .text(title, MARGIN + logoW + 36, titleY, { lineBreak: false });
  const metaY = contentY + 4 + logoH + 8;
  for (const f of metaFields) {
    doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
      .text(f.label, f.x, metaY, { lineBreak: false });
    doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
      .text(f.value, f.x, metaY + 11, { lineBreak: false });
  }
  return metaY + 11 + 12 + 6;
}

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
    try { doc.image(logoPath, MARGIN, contentY + 4, { height: logoH }); logoW = logoH * 1.4; }
    catch { logoW = 0; }
  }
  const logoCentreY = contentY + 4 + logoH / 2;
  doc.fillColor(GD_NAVY).fontSize(14).font("Helvetica-Bold")
    .text(title, MARGIN + logoW + 16, logoCentreY - 7, { lineBreak: false });
  doc.fillColor(GD_GRAY).fontSize(7.5).font("Helvetica")
    .text(subtitle, MARGIN + logoW + 10 + 150, logoCentreY - 5, { lineBreak: false });
  const dividerY = contentY + 4 + logoH + 6;
  doc.moveTo(MARGIN, dividerY).lineTo(PAGE_W - MARGIN, dividerY).stroke(GD_BORDER);
  return dividerY + 8;
}

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
    const words = col.label.split(" ");
    const hasWidth = col.width != null;
    const willWrap = hasWidth && words.length > 1;
    const textY = (words.length > 2 || willWrap) ? y + 4 : y + 10;
    const colW = col.width ?? 40;
    if (col.align === "right") {
      doc.text(col.label, col.x, textY, { width: colW, align: "right", lineBreak: willWrap });
    } else if (hasWidth) {
      doc.text(col.label, col.x, textY, { width: colW, lineBreak: willWrap });
    } else {
      doc.text(col.label, col.x, textY, { lineBreak: false });
    }
  }
  return y + h;
}

function drawTotalBar(
  doc: PDFKit.PDFDocument,
  label: string,
  total: number,
  tableL: number,
  tableR: number,
  y: number,
  totalColX?: number,
  totalColW?: number
): number {
  const th = 22;
  const y2 = y + 4;
  doc.roundedRect(tableL, y2, tableR - tableL, th, 3).fill(TOTAL_BG);
  doc.roundedRect(tableL, y2, 4, th, 1).fill(GD_GREEN);
  doc.fillColor(GD_NAVY).fontSize(9).font("Helvetica-Bold")
    .text(label, tableL + 8, y2 + 7, { lineBreak: false });
  const numX = totalColX !== undefined ? totalColX : tableR - 60;
  const numW = totalColW ?? 40;
  doc.fillColor(GD_GREEN).fontSize(13).font("Helvetica-Bold")
    .text(String(total), numX, y2 + 5, { width: numW, align: "right", lineBreak: false });
  return y2 + th;
}

/**
 * Generates a standalone Move Summary PDF showing every individual pull list
 * movement (Staging moves first, then Pick Face moves), sorted by type then SKU.
 * Landscape Letter, GD-branded header.
 */
export async function generateMoveSummaryPDF(
  res: Response | Writable,
  items: PullListItem[],
  meta: RunMeta
) {
  const logoPath = getLogoBuffer();
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: true });

  if ("setHeader" in res) {
    (res as Response).setHeader("Content-Type", "application/pdf");
    (res as Response).setHeader(
      "Content-Disposition",
      `attachment; filename="move-summary-run-${meta.runId}.pdf"`
    );
  }
  doc.pipe(res);

  const tableL = MARGIN - 4;
  const tableR = PAGE_W - MARGIN + 4;
  const ROW_H = 22;

  // Sort: staging first, then pick face; within each group sort by SKU
  const sorted = items.slice().sort((a, b) => {
    const typeOrder = (m?: string) => (!m || m === "to_staging" ? 0 : 1);
    const td = typeOrder(a.movement) - typeOrder(b.movement);
    if (td !== 0) return td;
    return a.sku.localeCompare(b.sku);
  });

  const stagingCount  = sorted.filter((i) => !i.movement || i.movement === "to_staging").length;
  const pickFaceCount = sorted.filter((i) => i.movement === "to_pick_face").length;
  const totalQty      = sorted.reduce((s, i) => s + i.qty, 0);

  // Column layout (landscape 792pt, usable ≈ 736pt)
  // TYPE(60) | SKU(120) | DESC(155) | LOT(80) | EXPIRY(68) | FROM(110) | TO(110) | QTY(48)
  const C_TYPE = tableL + 4;
  const C_SKU  = C_TYPE + 64;
  const C_DESC = C_SKU  + 124;
  const C_LOT  = C_DESC + 159;
  const C_EXP  = C_LOT  + 84;
  const C_FROM = C_EXP  + 72;
  const C_TO   = C_FROM + 114;
  const C_QTY  = tableR - 52;

  const cols: ColSpec[] = [
    { label: "Type",          x: C_TYPE, width: 60 },
    { label: "SKU",           x: C_SKU,  width: 120 },
    { label: "Description",   x: C_DESC, width: 155 },
    { label: "Lot #",         x: C_LOT,  width: 80 },
    { label: "Expiry",        x: C_EXP,  width: 68 },
    { label: "From Location", x: C_FROM, width: 110 },
    { label: "To Location",   x: C_TO,   width: 110 },
    { label: "Qty",           x: C_QTY,  align: "right", width: 48 },
  ];

  const customerLabel = getCustomerName(meta);

  // ── Page 1 header ──────────────────────────────────────────────────────────
  let y = drawFullHeader(doc, "Move Summary", logoPath, [
    { label: "RUN",       value: `#${meta.runId}`,              x: MARGIN },
    { label: "CUSTOMER",  value: customerLabel,                  x: MARGIN + 90 },
    { label: "DATE",      value: formatDate(meta.createdAt),     x: MARGIN + 310 },
    { label: "STAGING",   value: String(stagingCount),           x: MARGIN + 470 },
    { label: "PICK FACE", value: String(pickFaceCount),          x: MARGIN + 540 },
    { label: "TOTAL QTY", value: totalQty.toLocaleString(),      x: MARGIN + 620 },
  ]);

  drawChrome(doc, 1, 1);

  // ── Table header ──────────────────────────────────────────────────────────
  y = drawTableHeaderRow(doc, y + 4, tableL, tableR, cols);

  // ── Rows ──────────────────────────────────────────────────────────────────
  let rowIdx = 0;
  for (const item of sorted) {
    // New page if needed
    if (y + ROW_H > PAGE_H - FOOTER_H - 4) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      drawChrome(doc, 2, 2);
      y = drawMiniHeader(doc, "Move Summary (cont.)", `Run #${meta.runId} · ${customerLabel}`, logoPath);
      y = drawTableHeaderRow(doc, y + 4, tableL, tableR, cols);
      rowIdx = 0;
    }

    const rowY = y;
    const isAlt = rowIdx % 2 === 1;
    doc.rect(tableL, rowY, tableR - tableL, ROW_H).fill(isAlt ? ROW_ALT : WHITE);

    const isStaging = !item.movement || item.movement === "to_staging";
    // Type badge
    const badgeBg    = isStaging ? "#ede9fe" : "#dbeafe";
    const badgeColor = isStaging ? "#6d28d9" : "#1d4ed8";
    const badgeLabel = isStaging ? "Staging" : "Pick Face";
    const badgeW = 54;
    const badgeH = 14;
    const badgeYc = rowY + (ROW_H - badgeH) / 2;
    doc.roundedRect(C_TYPE, badgeYc, badgeW, badgeH, 3).fill(badgeBg);
    doc.fillColor(badgeColor).fontSize(7).font("Helvetica-Bold")
      .text(badgeLabel, C_TYPE, badgeYc + 3.5, { width: badgeW, align: "center", lineBreak: false });

    const textY = rowY + 7;
    doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica-Bold")
      .text(item.sku, C_SKU, textY, { width: 120, lineBreak: false });
    doc.fillColor(GD_GRAY).fontSize(7.5).font("Helvetica")
      .text(item.description ?? "—", C_DESC, textY, { width: 155, lineBreak: false });
    doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
      .text(item.lotNumber ?? "—", C_LOT, textY, { width: 80, lineBreak: false });

    const expLabel = item.expirationDate
      ? new Date(item.expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
      : "—";
    doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
      .text(expLabel, C_EXP, textY, { width: 68, lineBreak: false });

    // From location with type mini-badge
    const fromType = item.fromLocationType;
    const ftBg    = fromType === "pick_face" ? "#dbeafe" : fromType === "staging" ? "#ede9fe" : "#ffedd5";
    const ftColor = fromType === "pick_face" ? "#1d4ed8" : fromType === "staging" ? "#6d28d9" : "#c2410c";
    const ftLabel = fromType === "pick_face" ? "PF" : fromType === "staging" ? "ST" : "WH";
    doc.roundedRect(C_FROM, badgeYc, 16, badgeH, 2).fill(ftBg);
    doc.fillColor(ftColor).fontSize(6.5).font("Helvetica-Bold")
      .text(ftLabel, C_FROM, badgeYc + 3.5, { width: 16, align: "center", lineBreak: false });
    doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
      .text(item.fromLocationName, C_FROM + 20, textY, { width: 90, lineBreak: false });

    doc.fillColor(GD_DKGRAY).fontSize(7.5).font("Helvetica")
      .text(item.toLocationName, C_TO, textY, { width: 110, lineBreak: false });

    doc.fillColor(GD_NAVY).fontSize(9).font("Helvetica-Bold")
      .text(String(item.qty), C_QTY, textY, { width: 48, align: "right", lineBreak: false });

    // Row bottom border
    doc.moveTo(tableL, rowY + ROW_H).lineTo(tableR, rowY + ROW_H).stroke(GD_BORDER);

    y += ROW_H;
    rowIdx++;
  }

  // ── Total bar ─────────────────────────────────────────────────────────────
  if (sorted.length === 0) {
    doc.fillColor(GD_GRAY).fontSize(10).font("Helvetica")
      .text("No movements recorded for this run.", tableL + 8, y + 16, { lineBreak: false });
  } else {
    drawTotalBar(doc, "TOTAL MOVEMENTS", totalQty, tableL, tableR, y, C_QTY, 48);
  }

  doc.end();
}
