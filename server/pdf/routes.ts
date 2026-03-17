import type { Express, Request, Response } from "express";
import { getAllocationRunById, getAllocationRunOrders } from "../db";
import { generatePullListPDF, generatePackListPDF } from "./generator";
import type { PullListItem, PackListItem, OrderPackData } from "./generator";
import { sdk } from "../_core/sdk";

// Helper: extract session user from cookie (reuse existing auth logic)
async function requireAuth(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
}

export function registerPdfRoutes(app: Express) {
  // GET /api/pdf/pull-list/:runId
  app.get("/api/pdf/pull-list/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    // Pull list is stored at the run level (global SKU-level movements).
    // Fall back to per-order pullListItems for older runs that predate the global pull list.
    const runPullList = run.pullList as PullListItem[] | null | undefined;
    const pullList: PullListItem[] = Array.isArray(runPullList) && runPullList.length > 0
      ? runPullList
      : allocated.flatMap((o) => {
          const detail = o.allocationDetail as { pullListItems?: PullListItem[] } | null;
          return detail?.pullListItems ?? [];
        });

    generatePullListPDF(res, pullList, {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
    });
  });

  // GET /api/pdf/pack-list/:runId
  app.get("/api/pdf/pack-list/:runId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const runId = Number(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "Invalid runId" }); return; }

    const run = await getAllocationRunById(runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const orders = await getAllocationRunOrders(runId);
    const allocated = orders.filter((o) => o.status === "allocated");

    // Build per-order pack data: one OrderPackData entry per allocated order
    const orderPackData: OrderPackData[] = allocated.map((o) => {
      const detail = o.allocationDetail as { packListItems?: PackListItem[]; lineItems?: Array<{ sku: string; qtyRequired: number }> } | null;
      const items = detail?.packListItems ?? [];
      const totalPieces = items.reduce((sum, i) => sum + (i.qty ?? 0), 0);
      return {
        orderId: o.orderId,
        referenceNum: o.referenceNum ?? "",
        totalLines: items.length,
        totalPieces,
        items,
      };
    });

    generatePackListPDF(res, orderPackData, {
      runId: run.id,
      facilityName: run.facilityName,
      customerName: run.customerName,
      customerNames: run.customerNames,
      createdAt: run.createdAt,
      allocatedCount: run.allocatedCount ?? 0,
      skippedCount: run.skippedCount ?? 0,
    });
  });
}
