/**
 * Audit Pick Ticket PDF Generator
 *
 * Renders one page per transaction ID with a bold diagonal AUDIT watermark.
 * Uses the same GD brand chrome (blue bar, green stripe, footer) as other PDF documents.
 */

import PDFDocument from "pdfkit";
import type { Writable } from "stream";
import type { Response } from "express";
import { GD_LOGO_B64 } from "./logo";

// ─── Brand colours ────────────────────────────────────────────────────────────
const GD_DKBLUE  = "#15527f";
const GD_NAVY    = "#0e3a5a";
const GD_GREEN   = "#37A400";
const GD_GRAY    = "#a6a8ab";
const GD_DKGRAY  = "#333333";
const GD_LTGRAY  = "#F4F6F8";
const GD_BORDER  = "#CDD4DC";
const ROW_ALT    = "#EEF4FB";
const GD_BLUE    = "#1a64a0";
const WHITE      = "#ffffff";

// ─── Page constants (portrait Letter = 612 × 792 pt) ─────────────────────────
const PAGE_W  = 612;
const PAGE_H  = 792;
const MARGIN  = 36;
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

// ─── Chrome: top bars + footer ────────────────────────────────────────────────
function drawChrome(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  doc.rect(0, 0, PAGE_W, TOP_BAR).fill(GD_DKBLUE);
  doc.rect(0, TOP_BAR, PAGE_W, GRN_BAR).fill(GD_GREEN);

  const footerY = PAGE_H - FOOTER_H;
  doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(GD_LTGRAY);
  doc.moveTo(0, footerY).lineTo(PAGE_W, footerY).stroke(GD_BORDER);
  doc
    .fillColor(GD_GRAY).fontSize(7).font("Helvetica")
    .text("Go Direct Wizard — Audit", 0, footerY + 8, { width: PAGE_W, align: "center", lineBreak: false });
  doc
    .fillColor(GD_GRAY).fontSize(7).font("Helvetica")
    .text(`${pageNum} of ${totalPages}`, MARGIN, footerY + 8, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });
}

// ─── Diagonal AUDIT watermark ─────────────────────────────────────────────────
function drawAuditWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  // Translate to centre of page, rotate 45°
  doc.translate(PAGE_W / 2, PAGE_H / 2);
  doc.rotate(-45);
  doc
    .fillColor("#cc2200")
    .opacity(0.10)
    .fontSize(120)
    .font("Helvetica-Bold")
    .text("AUDIT", 0, 0, {
      width: 600,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
  // Reset opacity
  doc.opacity(1);
}

// ─── Ticket data shape ────────────────────────────────────────────────────────
export interface AuditPickTicket {
  transactionId: number;
  referenceNum: string;
  poNum: string;
  customerName: string;
  facilityName: string;
  status: number;
  creationDate: string;
  shipTo: {
    companyName: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
  };
  items: Array<{
    sku: string;
    description: string;
    qty: number;
    lotNumber: string;
    expirationDate: string;
  }>;
}

// ─── Main generator ───────────────────────────────────────────────────────────
export async function generateAuditPickTicketsPDF(
  output: Writable | Response,
  tickets: AuditPickTicket[]
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

    // Pipe to output
    if (typeof (output as Response).setHeader === "function") {
      const res = output as Response;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="audit-pick-tickets.pdf"`);
    }
    doc.pipe(output as Writable);

    const logoBuffer = getLogoBuffer();
    const totalPages = tickets.length;

    tickets.forEach((ticket, idx) => {
      doc.addPage();
      const pageNum = idx + 1;

      // Chrome
      drawChrome(doc, pageNum, totalPages);

      // Watermark (drawn first so content sits on top)
      drawAuditWatermark(doc);

      // ── Header ──────────────────────────────────────────────────────────────
      const contentY = TOP_BAR + GRN_BAR + 4;
      const logoH = 40;

      try {
        doc.image(logoBuffer, MARGIN, contentY, { height: logoH });
      } catch { /* logo unavailable */ }

      // Title + AUDIT badge
      const titleX = MARGIN + logoH * 1.4 + 16;
      const titleY = contentY + logoH / 2 - 10;
      doc
        .fillColor(GD_NAVY).fontSize(18).font("Helvetica-Bold")
        .text("Pick Ticket", titleX, titleY, { lineBreak: false });

      // Red AUDIT badge
      const badgeX = PAGE_W - MARGIN - 80;
      const badgeY = contentY + 4;
      doc.roundedRect(badgeX, badgeY, 76, 22, 3).fill("#cc2200");
      doc
        .fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
        .text("AUDIT", badgeX, badgeY + 5, { width: 76, align: "center", lineBreak: false });

      // ── Metadata grid ────────────────────────────────────────────────────────
      const metaY = contentY + logoH + 10;
      const col1 = MARGIN;
      const col2 = MARGIN + 160;
      const col3 = MARGIN + 320;

      function metaField(label: string, value: string, x: number, y: number) {
        doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
          .text(label, x, y, { lineBreak: false });
        doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
          .text(value || "—", x, y + 11, { lineBreak: false });
      }

      metaField("Transaction ID", String(ticket.transactionId), col1, metaY);
      metaField("Reference #", ticket.referenceNum || "—", col2, metaY);
      metaField("PO #", ticket.poNum || "—", col3, metaY);

      const metaY2 = metaY + 30;
      metaField("Customer", ticket.customerName || "—", col1, metaY2);
      metaField("Facility", ticket.facilityName || "—", col2, metaY2);
      metaField("Order Date", formatDate(ticket.creationDate), col3, metaY2);

      // Ship-to block
      const metaY3 = metaY2 + 30;
      const shipAddr = [
        ticket.shipTo?.companyName,
        ticket.shipTo?.address1,
        [ticket.shipTo?.city, ticket.shipTo?.state, ticket.shipTo?.zip].filter(Boolean).join(", "),
      ].filter(Boolean).join(" | ");
      metaField("Ship To", shipAddr || "—", col1, metaY3);

      // Divider
      const dividerY = metaY3 + 32;
      doc.moveTo(MARGIN, dividerY).lineTo(PAGE_W - MARGIN, dividerY).stroke(GD_BORDER);

      // ── Items table ──────────────────────────────────────────────────────────
      const tableY = dividerY + 8;
      const tableL = MARGIN;
      const tableR = PAGE_W - MARGIN;
      const tableW = tableR - tableL;

      // Column widths
      const colSku      = { x: tableL,           w: tableW * 0.22 };
      const colDesc     = { x: tableL + tableW * 0.22, w: tableW * 0.28 };
      const colQty      = { x: tableL + tableW * 0.50, w: tableW * 0.10 };
      const colLot      = { x: tableL + tableW * 0.60, w: tableW * 0.22 };
      const colExp      = { x: tableL + tableW * 0.82, w: tableW * 0.18 };

      // Header row
      const hdrH = 22;
      doc.roundedRect(tableL, tableY, tableW, hdrH, 3).fill(GD_DKBLUE);
      doc.fillColor(WHITE).fontSize(7.5).font("Helvetica-Bold");
      const hdrTextY = tableY + 7;
      doc.text("SKU",           colSku.x + 4,  hdrTextY, { width: colSku.w - 4,  lineBreak: false });
      doc.text("Description",   colDesc.x + 4, hdrTextY, { width: colDesc.w - 4, lineBreak: false });
      doc.text("Qty",           colQty.x,      hdrTextY, { width: colQty.w,      align: "right", lineBreak: false });
      doc.text("Lot #",         colLot.x + 4,  hdrTextY, { width: colLot.w - 4,  lineBreak: false });
      doc.text("Expiry",        colExp.x + 4,  hdrTextY, { width: colExp.w - 4,  lineBreak: false });

      // Item rows
      let rowY = tableY + hdrH;
      const rowH = 20;
      const maxRows = Math.floor((PAGE_H - FOOTER_H - rowY - 10) / rowH);
      const displayItems = ticket.items.slice(0, maxRows);

      displayItems.forEach((item, i) => {
        const bg = i % 2 === 1 ? ROW_ALT : WHITE;
        doc.rect(tableL, rowY, tableW, rowH).fill(bg);

        const textY = rowY + 5;
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica");
        doc.text(item.sku || "—",          colSku.x + 4,  textY, { width: colSku.w - 4,  lineBreak: false });
        doc.text(item.description || "—",  colDesc.x + 4, textY, { width: colDesc.w - 4, lineBreak: false });
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica-Bold")
          .text(String(item.qty),          colQty.x,      textY, { width: colQty.w,      align: "right", lineBreak: false });
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica");
        doc.text(item.lotNumber || "—",    colLot.x + 4,  textY, { width: colLot.w - 4,  lineBreak: false });
        doc.text(item.expirationDate ? formatDate(item.expirationDate) : "—",
                                           colExp.x + 4,  textY, { width: colExp.w - 4,  lineBreak: false });

        // Row bottom border
        doc.moveTo(tableL, rowY + rowH).lineTo(tableR, rowY + rowH).stroke(GD_BORDER);
        rowY += rowH;
      });

      // Overflow note
      if (ticket.items.length > maxRows) {
        doc.fillColor(GD_GRAY).fontSize(7).font("Helvetica-Oblique")
          .text(`+ ${ticket.items.length - maxRows} more item(s) not shown`, tableL, rowY + 4, { lineBreak: false });
      }

      // Total row
      const totalQty = ticket.items.reduce((s, it) => s + (it.qty ?? 0), 0);
      const totalRowY = rowY + 2;
      doc.rect(tableL, totalRowY, tableW, rowH).fill("#EDFAEB");
      doc.fillColor(GD_NAVY).fontSize(8).font("Helvetica-Bold")
        .text("TOTAL",  colSku.x + 4, totalRowY + 5, { lineBreak: false })
        .text(String(totalQty), colQty.x, totalRowY + 5, { width: colQty.w, align: "right", lineBreak: false });
    });

    doc.end();
    doc.on("finish", resolve);
  });
}
