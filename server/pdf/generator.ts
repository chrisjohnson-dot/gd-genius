import PDFDocument from "pdfkit";
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
  referenceNum: string;
  sku: string;
  description?: string;
  qty: number;
  lotNumber?: string;
  expirationDate?: string;
  locationName: string;
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

// ─── Pack List PDF ─────────────────────────────────────────────────────────────

export function generatePackListPDF(res: Response, items: PackListItem[], meta: RunMeta) {
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

  drawPageHeader(doc, "Pack List — Items to Pack per Order", meta);

  if (items.length === 0) {
    doc
      .fillColor(TEXT_MUTED)
      .fontSize(11)
      .text("No items to pack.", margin, doc.y, { width: tableWidth, align: "center" });
    doc.end();
    return;
  }

  const cols = [
    { label: "Order #", width: 90, align: "left" as const },
    { label: "SKU", width: 90, align: "left" as const },
    { label: "Description", width: 150, align: "left" as const },
    { label: "Qty", width: 40, align: "right" as const },
    { label: "Lot #", width: 70, align: "left" as const },
    { label: "Expiry", width: 65, align: "left" as const },
    { label: "Location", width: tableWidth - 90 - 90 - 150 - 40 - 70 - 65, align: "left" as const },
  ];

  // Group by order reference
  const grouped = new Map<string, PackListItem[]>();
  for (const item of items) {
    if (!grouped.has(item.referenceNum)) grouped.set(item.referenceNum, []);
    grouped.get(item.referenceNum)!.push(item);
  }

  let rowIndex = 0;
  for (const [refNum, orderItems] of Array.from(grouped)) {
    // Order group header
    ensurePageSpace(doc, 28);
    const groupHeaderHeight = 16;
    doc.rect(margin, doc.y, tableWidth, groupHeaderHeight).fill("#dbeafe");
    doc.rect(margin, doc.y, tableWidth, groupHeaderHeight).stroke(BORDER_COLOR);
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .text(`Order: ${refNum}  (${orderItems.length} line${orderItems.length !== 1 ? "s" : ""})`, margin + 6, doc.y + 4, {
        width: tableWidth - 12,
      });
    doc.y += groupHeaderHeight;

    // Column headers for this group
    drawTableHeader(doc, cols, margin);

    for (const item of orderItems) {
      ensurePageSpace(doc, 22);
      drawTableRow(
        doc,
        [
          { value: item.referenceNum },
          { value: item.sku },
          { value: item.description ?? "—" },
          { value: String(item.qty), align: "right" },
          { value: item.lotNumber ?? "—" },
          { value: formatDate(item.expirationDate) },
          { value: item.locationName },
        ],
        cols.map((c) => c.width),
        margin,
        rowIndex++
      );
    }

    doc.moveDown(0.4);
  }

  doc
    .moveDown(1)
    .fillColor(TEXT_MUTED)
    .fontSize(8)
    .text(
      `Total orders: ${grouped.size}   |   Total lines: ${items.length}   |   Generated: ${new Date().toLocaleString()}`,
      margin,
      doc.y,
      { width: tableWidth, align: "right" }
    );

  doc.end();
}
