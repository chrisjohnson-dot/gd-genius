/**
 * Audit Shipping Document PDF Generator
 *
 * Renders a Bill-of-Lading-style shipping document for each transaction ID
 * with a bold diagonal AUDIT watermark.  Uses the same GD brand chrome as
 * other PDF documents (blue top bar, green stripe, footer).
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
    .text("Go Direct Wizard — Audit Shipping Documents", 0, footerY + 8, {
      width: PAGE_W,
      align: "center",
      lineBreak: false,
    });
  doc
    .fillColor(GD_GRAY).fontSize(7).font("Helvetica")
    .text(`${pageNum} of ${totalPages}`, MARGIN, footerY + 8, {
      width: PAGE_W - MARGIN * 2,
      align: "right",
      lineBreak: false,
    });
}

// ─── Diagonal AUDIT watermark ─────────────────────────────────────────────────
function drawAuditWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.translate(PAGE_W / 2, PAGE_H / 2);
  doc.rotate(-45);
  doc
    .fillColor("#cc2200")
    .opacity(0.10)
    .fontSize(120)
    .font("Helvetica-Bold")
    .text("AUDIT", 0, 0, { width: 600, align: "center", lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

// ─── Shipping document data shape ─────────────────────────────────────────────
export interface AuditShippingDocument {
  transactionId: number;
  referenceNum: string;
  poNum: string;
  customerName: string;
  facilityName: string;
  creationDate: string;
  shipDate: string;
  trackingNumber: string;
  bolNumber: string;
  carrierName: string;
  carrierCode: string;
  shipVia: string;
  totalWeight: number | null;
  totalCartons: number | null;
  shipTo: {
    companyName: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
  };
  shipFrom: {
    companyName: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
  };
  items: Array<{
    sku: string;
    description: string;
    qty: number;
    lotNumber: string;
    expirationDate: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addressBlock(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}

// ─── Main generator ───────────────────────────────────────────────────────────
export async function generateAuditShippingDocumentsPDF(
  output: Writable | Response,
  docs: AuditShippingDocument[]
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
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-shipping-documents.pdf"`
      );
    }
    doc.pipe(output as Writable);

    const logoBuffer = getLogoBuffer();
    const totalPages = docs.length;

    docs.forEach((sd, idx) => {
      doc.addPage();
      const pageNum = idx + 1;

      drawChrome(doc, pageNum, totalPages);
      drawAuditWatermark(doc);

      // ── Header ───────────────────────────────────────────────────────────────
      const contentY = TOP_BAR + GRN_BAR + 4;
      const logoH = 40;

      try { doc.image(logoBuffer, MARGIN, contentY, { height: logoH }); } catch { /* ok */ }

      const titleX = MARGIN + logoH * 1.4 + 16;
      const titleY = contentY + logoH / 2 - 10;
      doc
        .fillColor(GD_NAVY).fontSize(18).font("Helvetica-Bold")
        .text("Bill of Lading", titleX, titleY, { lineBreak: false });

      // Red AUDIT badge
      const badgeX = PAGE_W - MARGIN - 80;
      const badgeY = contentY + 4;
      doc.roundedRect(badgeX, badgeY, 76, 22, 3).fill("#cc2200");
      doc
        .fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
        .text("AUDIT", badgeX, badgeY + 5, { width: 76, align: "center", lineBreak: false });

      // ── Top metadata row ─────────────────────────────────────────────────────
      const metaY = contentY + logoH + 10;
      const col1 = MARGIN;
      const col2 = MARGIN + 160;
      const col3 = MARGIN + 320;
      const col4 = MARGIN + 450;

      function metaField(label: string, value: string, x: number, y: number, w = 140) {
        doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
          .text(label, x, y, { lineBreak: false, width: w });
        doc.fillColor(GD_DKGRAY).fontSize(9).font("Helvetica-Bold")
          .text(value || "—", x, y + 11, { lineBreak: false, width: w });
      }

      metaField("Transaction ID",  String(sd.transactionId), col1, metaY);
      metaField("Reference #",     sd.referenceNum || "—",   col2, metaY);
      metaField("PO #",            sd.poNum || "—",          col3, metaY);
      metaField("Order Date",      formatDate(sd.creationDate), col4, metaY, 120);

      const metaY2 = metaY + 30;
      metaField("Customer",        sd.customerName || "—",   col1, metaY2);
      metaField("Facility",        sd.facilityName || "—",   col2, metaY2);
      metaField("Ship Date",       formatDate(sd.shipDate),   col3, metaY2);
      metaField("BOL #",           sd.bolNumber || "—",      col4, metaY2, 120);

      const metaY3 = metaY2 + 30;
      metaField("Carrier",         sd.carrierName || "—",    col1, metaY3);
      metaField("SCAC",            sd.carrierCode || "—",    col2, metaY3);
      metaField("Service / Ship Via", sd.shipVia || "—",     col3, metaY3);
      metaField("Tracking / PRO #", sd.trackingNumber || "—", col4, metaY3, 120);

      const metaY4 = metaY3 + 30;
      metaField(
        "Total Weight",
        sd.totalWeight != null ? `${sd.totalWeight.toLocaleString()} lbs` : "—",
        col1, metaY4
      );
      metaField(
        "Total Cartons",
        sd.totalCartons != null ? String(sd.totalCartons) : "—",
        col2, metaY4
      );

      // Divider
      const div1Y = metaY4 + 32;
      doc.moveTo(MARGIN, div1Y).lineTo(PAGE_W - MARGIN, div1Y).stroke(GD_BORDER);

      // ── Ship-From / Ship-To boxes ─────────────────────────────────────────────
      const addrY = div1Y + 8;
      const addrBoxW = (PAGE_W - MARGIN * 2 - 12) / 2;
      const addrBoxH = 80;

      // Ship-From box
      doc.roundedRect(MARGIN, addrY, addrBoxW, addrBoxH, 4).stroke(GD_BORDER);
      doc.fillColor(GD_DKBLUE).fontSize(7).font("Helvetica-Bold")
        .text("SHIP FROM", MARGIN + 6, addrY + 6, { lineBreak: false });
      const fromLines = [
        sd.shipFrom?.companyName,
        sd.shipFrom?.address1,
        [sd.shipFrom?.city, sd.shipFrom?.state, sd.shipFrom?.zip].filter(Boolean).join(", "),
        sd.shipFrom?.country && sd.shipFrom.country !== "US" ? sd.shipFrom.country : undefined,
        sd.shipFrom?.phone ? `Ph: ${sd.shipFrom.phone}` : undefined,
      ].filter(Boolean) as string[];
      doc.fillColor(GD_DKGRAY).fontSize(8.5).font("Helvetica")
        .text(
          addressBlock(fromLines) || "—",
          MARGIN + 6, addrY + 18,
          { width: addrBoxW - 12, lineBreak: true }
        );

      // Ship-To box
      const toBoxX = MARGIN + addrBoxW + 12;
      doc.roundedRect(toBoxX, addrY, addrBoxW, addrBoxH, 4).stroke(GD_BORDER);
      doc.fillColor(GD_DKBLUE).fontSize(7).font("Helvetica-Bold")
        .text("SHIP TO", toBoxX + 6, addrY + 6, { lineBreak: false });
      const toLines = [
        sd.shipTo?.companyName,
        sd.shipTo?.address1,
        [sd.shipTo?.city, sd.shipTo?.state, sd.shipTo?.zip].filter(Boolean).join(", "),
        sd.shipTo?.country && sd.shipTo.country !== "US" ? sd.shipTo.country : undefined,
        sd.shipTo?.phone ? `Ph: ${sd.shipTo.phone}` : undefined,
      ].filter(Boolean) as string[];
      doc.fillColor(GD_DKGRAY).fontSize(8.5).font("Helvetica")
        .text(
          addressBlock(toLines) || "—",
          toBoxX + 6, addrY + 18,
          { width: addrBoxW - 12, lineBreak: true }
        );

      // Divider
      const div2Y = addrY + addrBoxH + 8;
      doc.moveTo(MARGIN, div2Y).lineTo(PAGE_W - MARGIN, div2Y).stroke(GD_BORDER);

      // ── Items table ──────────────────────────────────────────────────────────
      const tableY = div2Y + 8;
      const tableL = MARGIN;
      const tableR = PAGE_W - MARGIN;
      const tableW = tableR - tableL;

      const colSku  = { x: tableL,                w: tableW * 0.22 };
      const colDesc = { x: tableL + tableW * 0.22, w: tableW * 0.28 };
      const colQty  = { x: tableL + tableW * 0.50, w: tableW * 0.10 };
      const colLot  = { x: tableL + tableW * 0.60, w: tableW * 0.22 };
      const colExp  = { x: tableL + tableW * 0.82, w: tableW * 0.18 };

      // Header row
      const hdrH = 22;
      doc.roundedRect(tableL, tableY, tableW, hdrH, 3).fill(GD_DKBLUE);
      doc.fillColor(WHITE).fontSize(7.5).font("Helvetica-Bold");
      const hdrTextY = tableY + 7;
      doc.text("SKU",         colSku.x + 4,  hdrTextY, { width: colSku.w - 4,  lineBreak: false });
      doc.text("Description", colDesc.x + 4, hdrTextY, { width: colDesc.w - 4, lineBreak: false });
      doc.text("Qty",         colQty.x,      hdrTextY, { width: colQty.w,      align: "right", lineBreak: false });
      doc.text("Lot #",       colLot.x + 4,  hdrTextY, { width: colLot.w - 4,  lineBreak: false });
      doc.text("Expiry",      colExp.x + 4,  hdrTextY, { width: colExp.w - 4,  lineBreak: false });

      let rowY = tableY + hdrH;
      const rowH = 20;
      const maxRows = Math.floor((PAGE_H - FOOTER_H - rowY - 10) / rowH);
      const displayItems = sd.items.slice(0, maxRows);

      displayItems.forEach((item, i) => {
        const bg = i % 2 === 1 ? ROW_ALT : WHITE;
        doc.rect(tableL, rowY, tableW, rowH).fill(bg);

        const textY = rowY + 5;
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica");
        doc.text(item.sku || "—",         colSku.x + 4,  textY, { width: colSku.w - 4,  lineBreak: false });
        doc.text(item.description || "—", colDesc.x + 4, textY, { width: colDesc.w - 4, lineBreak: false });
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica-Bold")
          .text(String(item.qty),          colQty.x,      textY, { width: colQty.w,      align: "right", lineBreak: false });
        doc.fillColor(GD_DKGRAY).fontSize(8).font("Helvetica");
        doc.text(item.lotNumber || "—",   colLot.x + 4,  textY, { width: colLot.w - 4,  lineBreak: false });
        doc.text(item.expirationDate ? formatDate(item.expirationDate) : "—",
                                          colExp.x + 4,  textY, { width: colExp.w - 4,  lineBreak: false });

        doc.moveTo(tableL, rowY + rowH).lineTo(tableR, rowY + rowH).stroke(GD_BORDER);
        rowY += rowH;
      });

      if (sd.items.length > maxRows) {
        doc.fillColor(GD_GRAY).fontSize(7).font("Helvetica-Oblique")
          .text(`+ ${sd.items.length - maxRows} more item(s) not shown`, tableL, rowY + 4, { lineBreak: false });
      }

      // Total row
      const totalQty = sd.items.reduce((s, it) => s + (it.qty ?? 0), 0);
      const totalRowY = rowY + 2;
      doc.rect(tableL, totalRowY, tableW, rowH).fill("#EDFAEB");
      doc.fillColor(GD_NAVY).fontSize(8).font("Helvetica-Bold")
        .text("TOTAL",      colSku.x + 4, totalRowY + 5, { lineBreak: false })
        .text(String(totalQty), colQty.x, totalRowY + 5, { width: colQty.w, align: "right", lineBreak: false });

      // ── Signature block ───────────────────────────────────────────────────────
      const sigY = totalRowY + rowH + 12;
      if (sigY + 50 < PAGE_H - FOOTER_H - 10) {
        const sigW = (tableW - 12) / 3;
        const sigBoxH = 40;

        const sigFields = [
          { label: "Shipper Signature", x: tableL },
          { label: "Carrier Signature", x: tableL + sigW + 6 },
          { label: "Date Received",     x: tableL + (sigW + 6) * 2 },
        ];

        sigFields.forEach(({ label, x }) => {
          doc.rect(x, sigY, sigW, sigBoxH).stroke(GD_BORDER);
          doc.fillColor(GD_GRAY).fontSize(6.5).font("Helvetica")
            .text(label, x + 4, sigY + 4, { lineBreak: false });
        });
      }
    });

    doc.end();
    doc.on("finish", resolve);
  });
}
