import PDFDocument from "pdfkit";
import { PDFDocument as PdfLib, rgb, StandardFonts } from "pdf-lib";
import { storagePut } from "./storage.js";

export interface BolData {
  orderNumber: number;
  referenceNum?: string | null;
  clientName: string;
  shipToName?: string | null;
  shipToCity?: string | null;
  facilityName?: string | null;
  outboundLocation?: string | null;
  palletCount?: number | null;
  carrierName?: string | null;
  driverName?: string | null;
  trailerNumber?: string | null;
  bolNumber?: string | null;
  proNumber?: string | null;
  appointmentId: number;
  scheduledDate?: string | null;
  scheduledTimeStart?: string | null;
}

/**
 * Generate a Bill of Lading PDF using pdfkit and upload to S3.
 * Returns the public S3 URL.
 */
export async function generateBolPdf(data: BolData): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const key = `bol/appt-${data.appointmentId}-order-${data.orderNumber}-${Date.now()}.pdf`;
      try {
        const { url } = await storagePut(key, pdfBuffer, "application/pdf");
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });

    const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").text("BILL OF LADING", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").text("Go Direct Logistics", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Reference block ──────────────────────────────────────────────────────
    const col1 = 50;
    const col2 = 310;
    const labelColor = "#6b7280";

    const field = (label: string, value: string, x: number, y: number) => {
      doc.fontSize(8).font("Helvetica").fillColor(labelColor).text(label, x, y);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text(value, x, y + 12);
    };

    let y = doc.y;
    field("BOL NUMBER", data.bolNumber ?? `GD-${data.appointmentId}`, col1, y);
    field("PRO NUMBER", data.proNumber ?? "—", col2, y);
    doc.moveDown(2.5);

    y = doc.y;
    field("ORDER / TRANSACTION #", String(data.orderNumber), col1, y);
    field("REFERENCE #", data.referenceNum ?? "—", col2, y);
    doc.moveDown(2.5);

    y = doc.y;
    field("DATE", now, col1, y);
    field("APPOINTMENT DATE", data.scheduledDate ?? "—", col2, y);
    doc.moveDown(2.5);

    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Shipper / Consignee ──────────────────────────────────────────────────
    y = doc.y;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text("SHIPPER", col1, y);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text("CONSIGNEE", col2, y);
    doc.moveDown(0.3);

    y = doc.y;
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("Go Direct Logistics", col1, y);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text(data.shipToName ?? data.clientName, col2, y);
    doc.moveDown(1.5);

    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Carrier / Driver ─────────────────────────────────────────────────────
    y = doc.y;
    field("CARRIER", data.carrierName ?? "—", col1, y);
    field("DRIVER NAME", data.driverName ?? "—", col2, y);
    doc.moveDown(2.5);

    y = doc.y;
    field("TRAILER NUMBER", data.trailerNumber ?? "—", col1, y);
    field("DOCK LOCATION", data.outboundLocation ?? "—", col2, y);
    doc.moveDown(2.5);

    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Commodity table ──────────────────────────────────────────────────────
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text("COMMODITY DESCRIPTION");
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const headers = ["DESCRIPTION", "PALLETS", "PIECES", "WEIGHT (LBS)", "FREIGHT CLASS"];
    const colWidths = [200, 70, 70, 90, 82];
    let cx = col1;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151");
    headers.forEach((h, i) => {
      doc.text(h, cx, tableTop, { width: colWidths[i] });
      cx += colWidths[i];
    });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.3);

    cx = col1;
    const rowY = doc.y;
    const rowData = [data.clientName, String(data.palletCount ?? "—"), "—", "—", "—"];
    doc.fontSize(10).font("Helvetica").fillColor("#111827");
    rowData.forEach((v, i) => {
      doc.text(v, cx, rowY, { width: colWidths[i] });
      cx += colWidths[i];
    });
    doc.moveDown(2);

    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Signature area ───────────────────────────────────────────────────────
    const sigY = doc.y;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text("SHIPPER SIGNATURE", col1, sigY);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text("DRIVER / CARRIER SIGNATURE", col2, sigY);
    doc.moveDown(0.3);

    // Signature boxes
    doc.rect(col1, doc.y, 240, 70).stroke();
    doc.rect(col2, doc.y - 0, 240, 70).stroke();
    doc.moveDown(4.5);

    const lineY = doc.y;
    doc.moveTo(col1, lineY).lineTo(col1 + 240, lineY).stroke();
    doc.moveTo(col2, lineY).lineTo(col2 + 240, lineY).stroke();
    doc.fontSize(8).font("Helvetica").fillColor(labelColor)
      .text("Signature & Date", col1, lineY + 2)
      .text("Signature & Date", col2, lineY + 2);

    doc.moveDown(1);
    doc.fontSize(7).fillColor(labelColor).text(
      "This Bill of Lading is not negotiable unless consigned to order. Received, subject to the classifications and tariffs in effect on the date of the issue of this Bill of Lading.",
      { align: "center" }
    );

    doc.end();
  });
}

/**
 * Overlay a base64 PNG signature onto an existing BOL PDF.
 * Returns the new S3 URL of the signed PDF.
 */
export async function overlaySignatureOnBol(
  bolUrl: string,
  signatureDataUrl: string,
  appointmentId: number,
  orderNumber: number
): Promise<string> {
  // Fetch the existing BOL PDF
  const response = await fetch(bolUrl);
  if (!response.ok) throw new Error(`Failed to fetch BOL: ${response.statusText}`);
  const bolBytes = await response.arrayBuffer();

  // Load with pdf-lib
  const pdfDoc = await PdfLib.load(bolBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Decode the base64 PNG
  const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
  const sigBytes = Buffer.from(base64Data, "base64");
  const sigImage = await pdfDoc.embedPng(sigBytes);

  // Place signature in the driver signature box (right column, ~70% down the page)
  const sigWidth = 220;
  const sigHeight = 60;
  const sigX = width / 2 + 10; // right column
  const sigY = height * 0.28;  // ~28% from bottom (signature box area)

  firstPage.drawImage(sigImage, {
    x: sigX,
    y: sigY,
    width: sigWidth,
    height: sigHeight,
  });

  // Add "Signed electronically" text
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  firstPage.drawText(`Signed electronically — ${new Date().toLocaleString()}`, {
    x: sigX,
    y: sigY - 12,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const signedBytes = await pdfDoc.save();
  const key = `bol/signed/appt-${appointmentId}-order-${orderNumber}-signed-${Date.now()}.pdf`;
  const { url } = await storagePut(key, Buffer.from(signedBytes), "application/pdf");
  return url;
}
