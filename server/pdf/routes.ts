import type { Express, Request, Response } from "express";
import { PassThrough } from "stream";
import archiver from "archiver";
import { getAllocationRunById, getAllocationRunOrders } from "../db";
import {
  generatePickFacePullSheetPDF,
  generateWarehousePullSheetPDF,
  generatePackListPDF,
} from "./generator";
import type { PullListItem, PackListItem, OrderPackData } from "./generator";
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

    // isDuplicate = true when documents have been previously printed (documentsPrintedAt already set)
    const isDuplicate = run.documentsPrintedAt != null;

    const runMeta = {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
      isDuplicate,
    };

    // Generate all three PDFs in parallel as buffers
    const [pfBuf, whBuf, packBuf] = await Promise.all([
      pdfToBuffer((pt) => generatePickFacePullSheetPDF(pt, pullList, runMeta)),
      pdfToBuffer((pt) => generateWarehousePullSheetPDF(pt, pullList, runMeta)),
      pdfToBuffer((pt) => generatePackListPDF(pt, orderPackData, runMeta)),
    ]);

    // Stream a ZIP back to the client
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="work-files-run-${runId}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(pfBuf, { name: `pick-face-pull-sheet-run-${runId}.pdf` });
    archive.append(whBuf, { name: `warehouse-pull-sheet-run-${runId}.pdf` });
    archive.append(packBuf, { name: `pack-sheet-run-${runId}.pdf` });
    await archive.finalize();
  });

  // ── Legacy pull-list endpoint (backward compat → redirects to pick-face) ─
  app.get("/api/pdf/pull-list/:runId", async (req: Request, res: Response) => {
    res.redirect(301, `/api/pdf/pick-face-pull-sheet/${req.params.runId}`);
  });
}
