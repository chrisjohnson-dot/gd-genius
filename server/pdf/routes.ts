import type { Express, Request, Response } from "express";
import { getAllocationRunById, getAllocationRunOrders } from "../db";
import {
  generatePickFacePullSheetPDF,
  generateWarehousePullSheetPDF,
  generatePackListPDF,
} from "./generator";
import type { PullListItem, PackListItem, OrderPackData } from "./generator";
import { sdk } from "../_core/sdk";

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

    generatePickFacePullSheetPDF(res, pullList, {
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

    generateWarehousePullSheetPDF(res, pullList, {
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

  // ── Legacy pull-list endpoint (backward compat → redirects to pick-face) ─
  app.get("/api/pdf/pull-list/:runId", async (req: Request, res: Response) => {
    res.redirect(301, `/api/pdf/pick-face-pull-sheet/${req.params.runId}`);
  });
}
