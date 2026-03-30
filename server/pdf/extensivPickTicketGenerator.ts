/**
 * Extensiv-Style Pick Ticket PDF Generator
 *
 * Faithfully reproduces the Extensiv (3PL Central) pick ticket layout:
 *  - "Pick Ticket" centred title with double rule
 *  - Dark-red customer name + warehouse (top-left) and Transaction # (top-right)
 *  - Barcode below transaction number
 *  - Ship-to / metadata block (Reference, Vendor, PO, Dates, Carrier, Service, Billing)
 *  - Notes section
 *  - Salmon-header items table with location/lot detail sub-rows
 *  - Totals row
 *  - Signature block (Picked / Packed / Details Sent checkboxes + name lines)
 *  - Diagonal AUDIT watermark on every page
 */

import PDFDocument from "pdfkit";
import type { Writable } from "stream";
import type { Response } from "express";

// ─── Colours matching the Extensiv pick ticket ────────────────────────────────
const DARK_RED   = "#8B0000";   // customer name, transaction #, data values
const SALMON     = "#FFD0D0";   // table header background
const GRAY_ROW   = "#F0F0F0";   // detail sub-row background
const BLACK      = "#000000";
const DARK_GRAY  = "#333333";
const MID_GRAY   = "#666666";
const LIGHT_GRAY = "#CCCCCC";
const WHITE      = "#FFFFFF";

// ─── Page constants (portrait Letter = 612 × 792 pt) ─────────────────────────
const PAGE_W  = 612;
const PAGE_H  = 792;
const MARGIN  = 36;

// ─── Ticket data shape ────────────────────────────────────────────────────────
export interface ExtensivStyleTicket {
  transactionId: number;
  referenceNum: string;
  poNum: string;
  vendorNum?: string;
  customerName: string;
  facilityName: string;
  creationDate: string;
  earliestShipDate?: string;
  cancelDate?: string;
  carrier?: string;
  service?: string;
  billing?: string;
  accountNum?: string;
  notes?: string;
  shipTo: {
    companyName?: string;
    name?: string;
    address1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  items: Array<{
    sku: string;
    description: string;
    qty: number;
    unitOfMeasure?: string;
    lotNumber?: string;
    expirationDate?: string;
    location?: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  } catch { return d; }
}

/** Draw a simple Code-128-style placeholder barcode (vertical lines) */
function drawBarcode(doc: PDFKit.PDFDocument, x: number, y: number, value: string, w = 110, h = 28) {
  // Encode each character as a deterministic pattern of narrow/wide bars
  const str = String(value);
  const barW = w / (str.length * 7 + 4);
  let cx = x;
  doc.save();
  doc.fillColor(BLACK);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 7-bit pattern derived from char code
    for (let b = 6; b >= 0; b--) {
      const bit = (code >> b) & 1;
      if (bit) {
        doc.rect(cx, y, barW * 0.8, h).fill();
      }
      cx += barW;
    }
  }
  doc.restore();
}

/** Draw the diagonal AUDIT watermark */
function drawAuditWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.translate(PAGE_W / 2, PAGE_H / 2);
  doc.rotate(-45);
  doc
    .fillColor("#cc2200")
    .opacity(0.09)
    .fontSize(110)
    .font("Helvetica-Bold")
    .text("AUDIT", -220, -60, { width: 440, align: "center", lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

/** Draw a horizontal rule */
function hRule(doc: PDFKit.PDFDocument, y: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, color = BLACK, thick = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(thick).strokeColor(color).stroke().restore();
}

// ─── Main generator ───────────────────────────────────────────────────────────
export async function generateExtensivPickTicketsPDF(
  output: Writable | Response,
  tickets: ExtensivStyleTicket[]
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "portrait",
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
    });

    doc.on("error", reject);

    if (typeof (output as Response).setHeader === "function") {
      const res = output as Response;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="extensiv-pick-tickets-audit.pdf"`);
    }
    doc.pipe(output as Writable);

    tickets.forEach((ticket) => {
      doc.addPage();

      // ── AUDIT watermark (drawn first so content sits on top) ────────────────
      drawAuditWatermark(doc);

      let y = MARGIN;

      // ── Title: "Pick Ticket" centred, with double rule ──────────────────────
      hRule(doc, y, MARGIN, PAGE_W - MARGIN, BLACK, 1.5);
      y += 4;
      doc
        .fillColor(BLACK).fontSize(14).font("Helvetica-Bold")
        .text("Pick Ticket", MARGIN, y, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      y += 18;
      hRule(doc, y, MARGIN, PAGE_W - MARGIN, BLACK, 1.5);
      y += 8;

      // ── Customer (top-left) + Transaction # (top-right) ────────────────────
      const headerY = y;
      doc
        .fillColor(DARK_RED).fontSize(13).font("Helvetica-Bold")
        .text(ticket.customerName || "—", MARGIN, headerY, { lineBreak: false });
      y += 16;
      doc
        .fillColor(DARK_RED).fontSize(10).font("Helvetica-Bold")
        .text(`Warehouse: ${ticket.facilityName || "—"}`, MARGIN + 4, y, { lineBreak: false });

      // Transaction # top-right
      const txLabel = `Transaction # : ${ticket.transactionId}`;
      doc
        .fillColor(DARK_RED).fontSize(13).font("Helvetica-Bold")
        .text(txLabel, MARGIN, headerY, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });

      // Barcode below transaction number (right-aligned)
      const barcodeW = 110;
      const barcodeX = PAGE_W - MARGIN - barcodeW;
      drawBarcode(doc, barcodeX, headerY + 18, String(ticket.transactionId), barcodeW, 22);

      y += 18;

      // ── Ship-to / metadata block ────────────────────────────────────────────
      const metaY = y;
      const col1X = MARGIN;
      const col2X = MARGIN + 180;
      const col3X = MARGIN + 360;

      // Ship To (left column)
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
        .text("Ship To", col1X, metaY, { lineBreak: false });
      let shipY = metaY + 10;
      const shipLines = [
        ticket.shipTo?.companyName,
        ticket.shipTo?.name,
        ticket.shipTo?.address1,
        [ticket.shipTo?.city, ticket.shipTo?.state, ticket.shipTo?.zip].filter(Boolean).join("  "),
      ].filter(Boolean) as string[];
      for (const line of shipLines) {
        doc.fillColor(DARK_GRAY).fontSize(7.5).font("Helvetica")
          .text(line, col1X, shipY, { lineBreak: false });
        shipY += 10;
      }

      // Centre column: Reference, Vendor, PO, Entered Date, Earliest Ship Date, Cancel Date
      function metaLine(label: string, value: string, x: number, ly: number) {
        doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
          .text(`${label}:`, x, ly, { lineBreak: false });
        doc.fillColor(DARK_RED).fontSize(7.5).font("Helvetica-Bold")
          .text(value || "", x + 75, ly, { lineBreak: false });
      }

      let mly = metaY;
      metaLine("Reference #", ticket.referenceNum || "", col2X, mly); mly += 11;
      metaLine("Vendor #",    ticket.vendorNum    || "", col2X, mly); mly += 11;
      metaLine("PO #",        ticket.poNum        || "", col2X, mly); mly += 11;
      metaLine("Entered Date", fmtDate(ticket.creationDate), col2X, mly); mly += 11;
      metaLine("Earliest Ship Date", fmtDate(ticket.earliestShipDate), col2X, mly); mly += 11;
      metaLine("Cancel Date", fmtDate(ticket.cancelDate), col2X, mly);

      // Right column: Carrier, Service, Billing, Account #
      let rly = metaY;
      metaLine("Carrier",   ticket.carrier   || "", col3X, rly); rly += 11;
      metaLine("Service",   ticket.service   || "", col3X, rly); rly += 11;
      metaLine("Billing",   ticket.billing   || "", col3X, rly); rly += 11;
      metaLine("Account #", ticket.accountNum || "", col3X, rly);

      y = Math.max(shipY, mly + 11, rly + 11) + 6;

      // ── Notes ───────────────────────────────────────────────────────────────
      if (ticket.notes) {
        doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
          .text("Notes :", MARGIN, y, { lineBreak: false });
        doc.fillColor(DARK_GRAY).fontSize(7.5).font("Helvetica")
          .text(ticket.notes, MARGIN + 44, y, {
            width: PAGE_W - MARGIN * 2 - 44,
            lineBreak: true,
          });
        y = doc.y + 4;
      }

      y += 4;

      // ── Items table ──────────────────────────────────────────────────────────
      const tableL = MARGIN;
      const tableR = PAGE_W - MARGIN;
      const tableW = tableR - tableL;

      // Column definitions matching Extensiv layout
      const cols = {
        sku:    { x: tableL,                w: tableW * 0.14 },
        desc:   { x: tableL + tableW * 0.14, w: tableW * 0.26 },
        uom:    { x: tableL + tableW * 0.40, w: tableW * 0.09 },
        qtyOrd: { x: tableL + tableW * 0.49, w: tableW * 0.07 },
        qtyShp: { x: tableL + tableW * 0.56, w: tableW * 0.07 },
        cuFt:   { x: tableL + tableW * 0.63, w: tableW * 0.07 },
        lbs:    { x: tableL + tableW * 0.70, w: tableW * 0.07 },
        pkdDim: { x: tableL + tableW * 0.77, w: tableW * 0.08 },
        totDim: { x: tableL + tableW * 0.85, w: tableW * 0.08 },
        dimUom: { x: tableL + tableW * 0.93, w: tableW * 0.07 },
      };

      // Header row (salmon background)
      const hdrH = 22;
      doc.rect(tableL, y, tableW, hdrH).fill(SALMON);
      // Vertical grid lines in header
      doc.save().strokeColor(LIGHT_GRAY).lineWidth(0.5);
      for (const col of Object.values(cols).slice(1)) {
        doc.moveTo(col.x, y).lineTo(col.x, y + hdrH).stroke();
      }
      doc.restore();

      const hdrTextY = y + 4;
      doc.fillColor(BLACK).fontSize(6.5).font("Helvetica-Bold");
      doc.text("SKU",              cols.sku.x + 2,    hdrTextY, { width: cols.sku.w - 2,    lineBreak: false });
      doc.text("Item Description", cols.desc.x + 2,   hdrTextY, { width: cols.desc.w - 2,   lineBreak: false });
      // Two-line headers for narrow columns
      doc.fontSize(5.5).text("Ordered Unit\nof Measure", cols.uom.x + 1, y + 1,  { width: cols.uom.w - 1,  lineBreak: true });
      doc.fontSize(6.5).text("Qty Ord",    cols.qtyOrd.x + 1, hdrTextY, { width: cols.qtyOrd.w - 1, lineBreak: false });
      doc.text("Qty Shipd",  cols.qtyShp.x + 1, hdrTextY, { width: cols.qtyShp.w - 1, lineBreak: false });
      doc.text("Cu Ft",      cols.cuFt.x + 1,   hdrTextY, { width: cols.cuFt.w - 1,   lineBreak: false });
      doc.text("Lbs",        cols.lbs.x + 1,    hdrTextY, { width: cols.lbs.w - 1,    lineBreak: false });
      doc.fontSize(5.5).text("Packed per\nDim UoM", cols.pkdDim.x + 1, y + 1, { width: cols.pkdDim.w - 1, lineBreak: true });
      doc.text("Total Qty\nDim UoM",  cols.totDim.x + 1, y + 1, { width: cols.totDim.w - 1, lineBreak: true });
      doc.text("Dim Unit of\nMeasure", cols.dimUom.x + 1, y + 1, { width: cols.dimUom.w - 1, lineBreak: true });

      y += hdrH;

      // Item rows
      let totalQty = 0;
      for (const item of ticket.items) {
        totalQty += item.qty ?? 0;

        // Main item row
        const mainRowH = 14;
        doc.rect(tableL, y, tableW, mainRowH).fill(WHITE);
        // Vertical grid lines
        doc.save().strokeColor(LIGHT_GRAY).lineWidth(0.5);
        for (const col of Object.values(cols).slice(1)) {
          doc.moveTo(col.x, y).lineTo(col.x, y + mainRowH).stroke();
        }
        doc.restore();

        const rowTextY = y + 3;
        doc.fillColor(DARK_GRAY).fontSize(7.5).font("Helvetica");
        doc.text(item.sku || "", cols.sku.x + 2, rowTextY, { width: cols.sku.w - 2, lineBreak: false });
        doc.text(item.description || "", cols.desc.x + 2, rowTextY, { width: cols.desc.w - 2, lineBreak: false });
        doc.text(item.unitOfMeasure || "Each", cols.uom.x + 1, rowTextY, { width: cols.uom.w - 1, lineBreak: false });
        doc.text(String(item.qty || 0), cols.qtyOrd.x + 1, rowTextY, { width: cols.qtyOrd.w - 1, lineBreak: false });

        // Bottom border
        hRule(doc, y + mainRowH, tableL, tableR, LIGHT_GRAY, 0.5);
        y += mainRowH;

        // Detail sub-row (gray background) — location, lot, expiry
        const hasDetail = item.location || item.lotNumber || item.expirationDate;
        if (hasDetail) {
          const detailH = 14;
          doc.rect(tableL, y, tableW, detailH).fill(GRAY_ROW);
          const detailParts: string[] = [];
          if (item.location)      detailParts.push(`Loc: ${item.location}`);
          if (item.lotNumber)     detailParts.push(`Lot#: ${item.lotNumber}`);
          if (item.expirationDate) detailParts.push(`Exp Date: ${fmtDate(item.expirationDate)}`);
          if (item.qty)           detailParts.push(`Qty (${item.unitOfMeasure || "Each"}): ${item.qty}`);
          doc.fillColor(MID_GRAY).fontSize(6.5).font("Helvetica")
            .text(`Details: ${detailParts.join("  ")}`, tableL + 4, y + 3, {
              width: tableW - 8,
              lineBreak: false,
            });
          hRule(doc, y + detailH, tableL, tableR, LIGHT_GRAY, 0.5);
          y += detailH;
        }
      }

      // Totals row
      const totH = 16;
      doc.rect(tableL, y, tableW, totH).fill(WHITE);
      // Outer border
      doc.save().strokeColor(BLACK).lineWidth(0.5)
        .rect(tableL, y, tableW, totH).stroke().restore();
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica-Bold")
        .text("Totals :", tableL + 2, y + 4, { lineBreak: false });
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica-Bold")
        .text(String(totalQty), cols.qtyOrd.x + 1, y + 4, { width: cols.qtyOrd.w - 1, lineBreak: false });
      y += totH + 12;

      // ── Signature block ──────────────────────────────────────────────────────
      const sigY = y;
      const checkSize = 8;

      function checkbox(cx: number, cy: number) {
        doc.save().strokeColor(BLACK).lineWidth(0.5)
          .rect(cx, cy, checkSize, checkSize).stroke().restore();
      }

      function sigLine(label: string, lx: number, ly: number, lineLen = 90) {
        doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
          .text(`${label}:`, lx, ly, { lineBreak: false });
        const lineX = lx + doc.widthOfString(`${label}: `) + 4;
        hRule(doc, ly + 9, lineX, lineX + lineLen, BLACK, 0.5);
      }

      // Row 1: Picked □  Details Sent □  Picked by: ___  Wrapped by: ___
      checkbox(MARGIN, sigY);
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
        .text("Picked", MARGIN + checkSize + 3, sigY, { lineBreak: false });

      checkbox(MARGIN + 70, sigY);
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
        .text("Details Sent", MARGIN + 70 + checkSize + 3, sigY, { lineBreak: false });

      sigLine("Picked by",  MARGIN + 200, sigY, 100);
      sigLine("Wrapped by", MARGIN + 360, sigY, 80);

      // Row 2: Packed □  (blank)  Checked by: ___  Loaded by: ___
      const sigY2 = sigY + 20;
      checkbox(MARGIN, sigY2);
      doc.fillColor(BLACK).fontSize(7.5).font("Helvetica")
        .text("Packed", MARGIN + checkSize + 3, sigY2, { lineBreak: false });

      sigLine("Checked by", MARGIN + 200, sigY2, 100);
      sigLine("Loaded by",  MARGIN + 360, sigY2, 80);
    });

    doc.end();
    doc.on("finish", resolve);
  });
}
