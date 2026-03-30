import type { Express, Request, Response } from "express";
import { PassThrough } from "stream";
import { PDFDocument } from "pdf-lib";
import { getAllocationRunById, getAllocationRunOrders, getExtensivConfigById } from "../db";
import {
  generatePickFacePullSheetPDF,
  generateWarehousePullSheetPDF,
  generatePackListPDF,
} from "./generator";
import type { PullListItem, PackListItem, OrderPackData } from "./generator";
import { generateAuditPickTicketsPDF } from "./auditGenerator";
import type { AuditPickTicket } from "./auditGenerator";
import { fetchOrderWithDetail } from "../extensiv/api";
import { sdk } from "../_core/sdk";

/** Collect a generator's output into a Buffer by piping through a PassThrough */
async function pdfToBuffer(
  generator: (stream: PassThrough) => Promise<void>
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const pt = new PassThrough();
    const chunks: Buffer[] = [];
    pt.on("data", (c: Buffer) => chunks.push(c));
    pt.on("end", () => resolve(Buffer.concat(chunks)));
    pt.on("error", reject);
    generator(pt).catch(reject);
  });
}

async function requireAuth(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" }); return false;
  }
}

export function registerPdfRoutes(app: Express) {
  // ── Pick Face Pull Sheet ─────────────────────────────────────────────────
  app.get("/api/pdf/pick-face-pull-sheet/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;
    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    const runPullList = run.pullList as PullListItem[] | null | undefined;
    const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
      ? runPullList
      : allocated.flatMap((o) => {
          const detail = o.allocationDetail as { pullListItems?: PullListItem[] } | null;
          return detail?.pullListItems ?? [];
        });

    await generatePickFacePullSheetPDF(res, pullList, {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
    });
  });

  // ── Warehouse Pull Sheet ─────────────────────────────────────────────────
  app.get("/api/pdf/warehouse-pull-sheet/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;
    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    const runPullList = run.pullList as PullListItem[] | null | undefined;
    const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
      ? runPullList
      : allocated.flatMap((o) => {
          const detail = o.allocationDetail as { pullListItems?: PullListItem[] } | null;
          return detail?.pullListItems ?? [];
        });

    await generateWarehousePullSheetPDF(res, pullList, {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
    });
  });

  // ── Pack Sheet ───────────────────────────────────────────────────────────
  app.get("/api/pdf/pack-list/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;
    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    const orderPackData: OrderPackData[] = allocated.map((o) => {
      const detail = o.allocationDetail as { packListItems?: PackListItem[] } | null;
      const items = detail?.packListItems ?? [];
      const totalPieces = items.reduce((sum, i) => sum + (i.qty ?? 0), 0);
      return {
        orderId: o.orderId,
        referenceNum: o.referenceNum ?? "",
        poNum: o.poNum ?? undefined,
        shipToName: o.shipToName ?? undefined,
        totalLines: items.length,
        totalPieces,
        items,
      };
    });

    await generatePackListPDF(res, orderPackData, {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
    });
  });

  // ── All Documents ZIP ────────────────────────────────────────────────────
  app.get("/api/pdf/all-documents/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;
    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    const runPullList = run.pullList as PullListItem[] | null | undefined;
    const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
      ? runPullList
      : allocated.flatMap((o) => {
          const detail = o.allocationDetail as { pullListItems?: PullListItem[] } | null;
          return detail?.pullListItems ?? [];
        });

    const orderPackData: OrderPackData[] = allocated.map((o) => {
      const detail = o.allocationDetail as { packListItems?: PackListItem[] } | null;
      const items = detail?.packListItems ?? [];
      const totalPieces = items.reduce((sum, i) => sum + (i.qty ?? 0), 0);
      return {
        orderId: o.orderId,
        referenceNum: o.referenceNum ?? "",
        poNum: o.poNum ?? undefined,
        shipToName: o.shipToName ?? undefined,
        totalLines: items.length,
        totalPieces,
        items,
      };
    });

    // isDuplicate = true only when documentsPrintedAt was ALREADY set before this request.
    // The UI passes ?firstPrint=1 on the very first print to suppress the badge.
    const firstPrint = req.query.firstPrint === "1";
    const isDuplicate = !firstPrint && run.documentsPrintedAt != null;

    const runMeta = {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
      isDuplicate,
      // Pass the actual order TX IDs so pull sheets show them instead of the run ID
      orderIds: allocated.map((o) => o.orderId),
    };

    // Generate all three PDFs in parallel as buffers
    const [pfBuf, whBuf, packBuf] = await Promise.all([
      pdfToBuffer((pt) => generatePickFacePullSheetPDF(pt, pullList, runMeta)),
      pdfToBuffer((pt) => generateWarehousePullSheetPDF(pt, pullList, runMeta)),
      pdfToBuffer((pt) => generatePackListPDF(pt, orderPackData, runMeta)),
    ]);

    // Merge all three PDFs into a single file using pdf-lib
    const merged = await PDFDocument.create();
    for (const buf of [pfBuf, whBuf, packBuf]) {
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    const mergedBytes = await merged.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="work-files-run-${runId}.pdf"`);
    res.end(Buffer.from(mergedBytes));
  });

  // ── Legacy pull-list endpoint (backward compat → redirects to pick-face) ─
  app.get("/api/pdf/pull-list/:runId", async (req: Request, res: Response) => {
    res.redirect(301, `/api/pdf/pick-face-pull-sheet/${req.params.runId}`);
  });

  // ── Audit Pick Tickets PDF ────────────────────────────────────────────────
  // POST /api/pdf/audit-pick-tickets
  // Body: { configId: number, transactionIds: number[] }
  app.post("/api/pdf/audit-pick-tickets", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const { configId, transactionIds } = req.body as { configId?: unknown; transactionIds?: unknown };

    if (typeof configId !== "number" || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      res.status(400).json({ error: "configId (number) and transactionIds (number[]) are required" });
      return;
    }
    if (transactionIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 transaction IDs per request" });
      return;
    }

    const config = await getExtensivConfigById(configId as number);
    if (!config) { res.status(404).json({ error: "Extensiv config not found" }); return; }

    // Fetch all orders in parallel, collect successes + errors
    const results = await Promise.allSettled(
      (transactionIds as number[]).map((txId) => fetchOrderWithDetail(config, txId))
    );

    const tickets: AuditPickTicket[] = [];
    const errors: Array<{ transactionId: number; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const txId = (transactionIds as number[])[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        const { order } = result.value;
        tickets.push({
          transactionId: txId,
          referenceNum: order.referenceNum ?? "",
          poNum: order.poNum ?? "",
          customerName: order.readOnly?.customerIdentifier?.name ?? "",
          facilityName: order.readOnly?.facilityIdentifier?.name ?? "",
          status: order.readOnly?.status ?? 0,
          creationDate: order.readOnly?.creationDate ?? "",
          shipTo: {
            companyName: order.shipTo?.companyName ?? "",
            address1: order.shipTo?.address1 ?? "",
            city: order.shipTo?.city ?? "",
            state: order.shipTo?.state ?? "",
            zip: order.shipTo?.zip ?? "",
          },
          items: (order.orderItems ?? []).map((item) => ({
            sku: item.itemIdentifier?.sku ?? "",
            description: "",
            qty: item.qty ?? 0,
            lotNumber: item.lotNumber ?? "",
            expirationDate: item.expirationDate ?? "",
          })),
        });
      } else {
        const err = result.reason as Error;
        errors.push({ transactionId: txId, error: err?.message ?? "Unknown error" });
      }
    }

    if (tickets.length === 0) {
      res.status(422).json({
        error: "No valid orders found for the provided transaction IDs",
        errors,
      });
      return;
    }

    // If some failed, include a warning header but still generate the PDF
    if (errors.length > 0) {
      res.setHeader("X-Audit-Errors", JSON.stringify(errors));
    }

    await generateAuditPickTicketsPDF(res, tickets);
  });
}
