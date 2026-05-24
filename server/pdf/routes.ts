import type { Express, Request, Response } from "express";
import { PassThrough } from "stream";
import { PDFDocument } from "pdf-lib";
import { getAllocationRunById, getAllocationRunOrders, getExtensivConfigById, getExtensivConfigs } from "../db";
import {
  generatePickFacePullSheetPDF,
  generateWarehousePullSheetPDF,
  generatePackListPDF,
} from "./generator";
import type { PullListItem, PackListItem, OrderPackData } from "./generator";
import { generateMoveSummaryPDF } from "./moveSummaryGenerator";
import { generateAuditPickTicketsPDF } from "./auditGenerator";
import type { AuditPickTicket } from "./auditGenerator";
import { generateAuditShippingDocumentsPDF } from "./auditShippingGenerator";
import type { AuditShippingDocument } from "./auditShippingGenerator";
import { generateExtensivPickTicketsPDF } from "./extensivPickTicketGenerator";
import type { ExtensivStyleTicket } from "./extensivPickTicketGenerator";
import { fetchOrderWithDetail, fetchItemDescriptions } from "../extensiv/api";
import type { ExtensivOrder, ExtensivOrderItem } from "../extensiv/api";
import { sdk } from "../_core/sdk";
import { generateGdPalletLabel } from "./gdPalletLabelGenerator";
import type { GdPalletLabelData } from "./gdPalletLabelGenerator";
import { generateSsccLabel } from "./ssccLabelGenerator";
import type { SsccLabelData } from "./ssccLabelGenerator";
import { getQcSessionById, getQcPallets, getQcScanItems } from "../db";

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

  // ── Move Summary PDF ─────────────────────────────────────────────────────────
  app.get("/api/pdf/move-summary/:runId", async (req: Request, res: Response) => {
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
    await generateMoveSummaryPDF(res, pullList, {
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

  // ── Audit Pick Tickets PDF ────────────────────────────────────────────────
  // POST /api/pdf/audit-pick-tickets
  // Body: { transactionIds: number[] }  (configId is now optional — auto-detected)
  app.post("/api/pdf/audit-pick-tickets", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const { configId, transactionIds } = req.body as { configId?: unknown; transactionIds?: unknown };

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      res.status(400).json({ error: "transactionIds (number[]) is required" });
      return;
    }
    if (transactionIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 transaction IDs per request" });
      return;
    }

    // Resolve config: use provided configId if given, otherwise use the first available config
    let config;
    if (typeof configId === "number") {
      config = await getExtensivConfigById(configId);
      if (!config) { res.status(404).json({ error: "Extensiv config not found" }); return; }
    } else {
      const allConfigs = await getExtensivConfigs();
      if (allConfigs.length === 0) {
        res.status(422).json({ error: "No Extensiv connections configured. Please add one in Settings." });
        return;
      }
      config = allConfigs[0];
    }

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

  // ── Audit Shipping Documents PDF ────────────────────────────────────────
  // POST /api/pdf/audit-shipping-documents
  // Body: { transactionIds: number[] }  (configId optional — auto-detected)
  app.post("/api/pdf/audit-shipping-documents", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const { configId, transactionIds } = req.body as { configId?: unknown; transactionIds?: unknown };

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      res.status(400).json({ error: "transactionIds (number[]) is required" });
      return;
    }
    if (transactionIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 transaction IDs per request" });
      return;
    }

    // Resolve config
    let config;
    if (typeof configId === "number") {
      config = await getExtensivConfigById(configId);
      if (!config) { res.status(404).json({ error: "Extensiv config not found" }); return; }
    } else {
      const allConfigs = await getExtensivConfigs();
      if (allConfigs.length === 0) {
        res.status(422).json({ error: "No Extensiv connections configured. Please add one in Settings." });
        return;
      }
      config = allConfigs[0];
    }

    // Fetch all orders in parallel
    const results = await Promise.allSettled(
      (transactionIds as number[]).map((txId) => fetchOrderWithDetail(config, txId))
    );

    const shippingDocs: AuditShippingDocument[] = [];
    const errors: Array<{ transactionId: number; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const txId = (transactionIds as number[])[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        const { order } = result.value;
        const ro = order.readOnly;
        shippingDocs.push({
          transactionId: txId,
          referenceNum:  order.referenceNum ?? "",
          poNum:         order.poNum ?? "",
          customerName:  ro?.customerIdentifier?.name ?? "",
          facilityName:  ro?.facilityIdentifier?.name ?? "",
          creationDate:  ro?.creationDate ?? "",
          shipDate:      ro?.shipDate ?? "",
          trackingNumber: ro?.trackingNumber ?? "",
          bolNumber:     ro?.bolNumber ?? "",
          carrierName:   ro?.carrierName ?? "",
          carrierCode:   ro?.carrierCode ?? "",
          shipVia:       ro?.shipVia ?? "",
          totalWeight:   ro?.totalWeight ?? null,
          totalCartons:  ro?.totalCartons ?? null,
          shipTo: {
            companyName: order.shipTo?.companyName ?? "",
            address1:    order.shipTo?.address1 ?? "",
            city:        order.shipTo?.city ?? "",
            state:       order.shipTo?.state ?? "",
            zip:         order.shipTo?.zip ?? "",
            country:     order.shipTo?.country ?? "",
            phone:       order.shipTo?.phone ?? "",
          },
          shipFrom: {
            companyName: order.shipFrom?.companyName ?? ro?.facilityIdentifier?.name ?? "",
            address1:    order.shipFrom?.address1 ?? "",
            city:        order.shipFrom?.city ?? "",
            state:       order.shipFrom?.state ?? "",
            zip:         order.shipFrom?.zip ?? "",
            country:     order.shipFrom?.country ?? "",
            phone:       order.shipFrom?.phone ?? "",
          },
          items: (order.orderItems ?? []).map((item) => ({
            sku:            item.itemIdentifier?.sku ?? "",
            description:    "",
            qty:            item.qty ?? 0,
            lotNumber:      item.lotNumber ?? "",
            expirationDate: item.expirationDate ?? "",
          })),
        });
      } else {
        const err = result.reason as Error;
        errors.push({ transactionId: txId, error: err?.message ?? "Unknown error" });
      }
    }

    if (shippingDocs.length === 0) {
      res.status(422).json({
        error: "No valid orders found for the provided transaction IDs",
        errors,
      });
      return;
    }

    if (errors.length > 0) {
      res.setHeader("X-Audit-Errors", JSON.stringify(errors));
    }

    await generateAuditShippingDocumentsPDF(res, shippingDocs);
  });

  // ── Extensiv-Style Pick Tickets PDF (faithful reproduction) ───────────────
  // POST /api/pdf/extensiv-pick-tickets
  // Body: { transactionIds: number[] }  (configId optional — auto-detected)
  app.post("/api/pdf/extensiv-pick-tickets", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const { configId, transactionIds } = req.body as { configId?: unknown; transactionIds?: unknown };

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      res.status(400).json({ error: "transactionIds (number[]) is required" });
      return;
    }
    if (transactionIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 transaction IDs per request" });
      return;
    }

    // Resolve config
    let config;
    if (typeof configId === "number") {
      config = await getExtensivConfigById(configId);
      if (!config) { res.status(404).json({ error: "Extensiv config not found" }); return; }
    } else {
      const allConfigs = await getExtensivConfigs();
      if (allConfigs.length === 0) {
        res.status(422).json({ error: "No Extensiv connections configured. Please add one in Settings." });
        return;
      }
      config = allConfigs[0];
    }

    const results = await Promise.allSettled(
      (transactionIds as number[]).map((txId) => fetchOrderWithDetail(config, txId))
    );

    const tickets: ExtensivStyleTicket[] = [];
    const errors: Array<{ transactionId: number; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const txId = (transactionIds as number[])[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        const { order } = result.value;
        const raw = order as unknown as ExtensivOrder;
        tickets.push({
          transactionId: txId,
          referenceNum:      raw.referenceNum ?? "",
          poNum:             raw.poNum ?? "",
          vendorNum:         "",
          customerName:      raw.readOnly?.customerIdentifier?.name ?? "",
          facilityName:      raw.readOnly?.facilityIdentifier?.name ?? "",
          creationDate:      raw.readOnly?.creationDate ?? "",
          earliestShipDate:  raw.earliestShipDate ?? "",
          cancelDate:        "",
          carrier:           raw.readOnly?.carrierName ?? raw.readOnly?.carrierCode ?? "",
          service:           raw.readOnly?.shipVia ?? "",
          billing:           "",
          accountNum:        "",
          notes:             raw.notes ?? "",
          shipTo: {
            companyName: raw.shipTo?.companyName ?? "",
            name:        raw.shipTo?.name ?? "",
            address1:    raw.shipTo?.address1 ?? "",
            city:        raw.shipTo?.city ?? "",
            state:       raw.shipTo?.state ?? "",
            zip:         raw.shipTo?.zip ?? "",
          },
          items: (raw.orderItems ?? []).map((item: ExtensivOrderItem) => ({
            sku:            item.itemIdentifier?.sku ?? "",
            description:    "",
            qty:            item.qty ?? 0,
            unitOfMeasure:  "Each",
            lotNumber:      item.lotNumber ?? "",
            expirationDate: item.expirationDate ?? "",
            location:       "",
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

    // ── Secondary lookup: fetch item descriptions per unique customer ──────────
    // Collect unique customer IDs from all successful tickets
    const customerIdMap = new Map<number, string>(); // customerId → customerName
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        const raw = result.value.order as unknown as ExtensivOrder;
        const cid = raw.readOnly?.customerIdentifier?.id;
        if (cid != null) {
          customerIdMap.set(cid, raw.readOnly?.customerIdentifier?.name ?? "");
        }
      }
    }

    // Fetch descriptions for all unique customers in parallel (best-effort)
    const descByCustomer = new Map<number, Map<string, string>>();
    await Promise.allSettled(
      Array.from(customerIdMap.keys()).map(async (cid) => {
        try {
          const descMap = await fetchItemDescriptions(config, cid);
          descByCustomer.set(cid, descMap);
        } catch {
          // Description lookup failure is non-fatal — leave descriptions blank
        }
      })
    );

    // Stamp descriptions onto ticket items
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const raw = result.value.order as unknown as ExtensivOrder;
      const cid = raw.readOnly?.customerIdentifier?.id;
      const descMap = cid != null ? descByCustomer.get(cid) : undefined;
      if (descMap && tickets[i - errors.filter((_, ei) => ei < i).length]) {
        // Find the corresponding ticket (errors shift the index)
        const ticket = tickets.find((t) => t.transactionId === (transactionIds as number[])[i]);
        if (ticket) {
          ticket.items = ticket.items.map((item) => ({
            ...item,
            description: descMap.get(item.sku) ?? item.description,
          }));
        }
      }
    }

    if (errors.length > 0) {
      res.setHeader("X-Audit-Errors", JSON.stringify(errors));
    }

    await generateExtensivPickTicketsPDF(res, tickets);
  });

  // ── GD Pallet Labels ─────────────────────────────────────────────────────────
  // GET /api/pdf/qc-gd-labels/:sessionId?type=gd|sscc|both
  app.get("/api/pdf/qc-gd-labels/:sessionId", async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid sessionId" }); return; }
    const labelType = (req.query.type as string) ?? "gd"; // gd | sscc | both
    const palletIdFilter = req.query.palletId ? Number(req.query.palletId) : null;

    const session = await getQcSessionById(sessionId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const allPallets = await getQcPallets(sessionId);
    const pallets = palletIdFilter != null ? allPallets.filter((p) => p.id === palletIdFilter) : allPallets;
    const items   = await getQcScanItems(sessionId);

    // Build a map of sku -> { description, scannedQty } from session items
    const itemMap = new Map(items.map((i) => [i.sku, i]));

    // GD address — resolved from session's facilityId (Extensiv facilityIdentifier.id)
    const GD_NAME = "Go Direct Solutions";
    // Facility address map keyed by Extensiv facilityId
    const FACILITY_ADDRESSES: Record<number, { address: string; csz: string }> = {
      4: { address: "#4 – 149 High Plains Place",  csz: "Rocky View County, AB  T4A 0W7" },  // Calgary
      2: { address: "5830 Saltzgaber Road",          csz: "Groveport, OH  43125" },             // Columbus
      5: { address: "460 Admiral Boulevard",         csz: "Mississauga, ON  L5T 3A3" },         // Mississauga
      3: { address: "#105 – 1175 Trademark Dr.",    csz: "Reno, NV  89521" },                  // Reno
    };
    // Require a known facilityId — no silent fallback
    const resolvedFacilityId = session.facilityId ?? null;
    if (resolvedFacilityId == null || !(resolvedFacilityId in FACILITY_ADDRESSES)) {
      const hint = resolvedFacilityId == null
        ? "Session has no facilityId. Re-fetch the order from Extensiv to populate the facility."
        : `Unknown facilityId ${resolvedFacilityId}. Add it to the FACILITY_ADDRESSES map in server/pdf/routes.ts.`;
      res.status(422).json({ error: `Cannot generate label: facility address unknown. ${hint}` });
      return;
    }
    const facilityInfo = FACILITY_ADDRESSES[resolvedFacilityId];
    const GD_ADDRESS = facilityInfo.address;
    const GD_CSZ     = facilityInfo.csz;

    // Ship-to from session
    let shipToName = session.customerName ?? "Customer";
    let shipToAddr = "";
    let shipToCSZ  = "";
    if (session.destinationAddress) {
      try {
        const da = JSON.parse(session.destinationAddress) as Record<string, string>;
        shipToName = da.companyName ?? da.name ?? shipToName;
        shipToAddr = da.address1 ?? "";
        shipToCSZ  = [da.city, da.state, da.zip].filter(Boolean).join(", ");
      } catch { /* ignore */ }
    }

    const txId = session.transactionId ?? session.id;
    const totalPallets = allPallets.length;  // always use full session pallet count, even when printing a single pallet

    // Build GD label data per pallet
    const gdLabels: GdPalletLabelData[] = pallets.map((p) => {
      const palletItems = (p.items as Array<{ sku: string; qty: number }> | null) ?? [];
      return {
        shipFromName: GD_NAME,
        shipFromAddress: GD_ADDRESS,
        shipFromCityStateZip: GD_CSZ,
        shipToName,
        shipToAddress: shipToAddr,
        shipToCityStateZip: shipToCSZ,
        transactionId: txId,
        weightLbs: p.weightOverrideLb != null
          ? parseFloat(String(p.weightOverrideLb))
          : p.calculatedWeightLb != null
            ? parseFloat(String(p.calculatedWeightLb))
            : undefined,
        dimL: 48,
        dimW: 40,
        dimH: p.palletHeightIn != null ? parseFloat(String(p.palletHeightIn)) : undefined,
        palletNumber: p.palletNumber,
        totalPallets,
        palletUpc: p.palletUpc ?? `GD-${sessionId}-P${p.palletNumber}`,
        items: palletItems.map((pi) => ({
          sku: pi.sku,
          description: itemMap.get(pi.sku)?.description ?? undefined,
          qty: pi.qty,
          caseAmount: itemMap.get(pi.sku)?.caseAmount ?? 1,
        })),
      };
    });

    // Build SSCC label data per pallet
    const ssccLabels: SsccLabelData[] = pallets.map((p) => {
      const palletItems = (p.items as Array<{ sku: string; qty: number }> | null) ?? [];
      // caseCount = sum of floor(qty ÷ caseAmount) per item — NOT a raw unit sum
      const caseCount = palletItems.reduce((s, i) => {
        const ca = Math.max(itemMap.get(i.sku)?.caseAmount ?? 1, 1);
        return s + Math.floor((i.qty ?? 0) / ca);
      }, 0);
      // SSCC-18: pad transactionId to 18 digits (GS1 format: extension digit + company prefix + serial + check)
      const rawSscc = String(txId).padStart(17, "0") + "0";
      const sscc18  = p.palletUpc?.replace(/\D/g, "").padStart(18, "0") ?? rawSscc;
      return {
        shipFromName: GD_NAME,
        shipFromAddress: GD_ADDRESS,
        shipFromCityStateZip: GD_CSZ,
        shipToName,
        shipToAddress: shipToAddr,
        shipToCityStateZip: shipToCSZ,
        orderNumber: String(txId),
        poNumber: session.poNumber ?? undefined,
        palletDescription: session.customerName?.toUpperCase() ?? "MIXED PALLET",
        caseCount,
        palletNumber: p.palletNumber,
        totalPallets,
        sscc18,
      };
    });

    // Generate PDFs
    const gdBuf = labelType !== "sscc"
      ? await pdfToBuffer((pt) => generateGdPalletLabel(gdLabels, pt))
      : null;
    const ssccBuf = labelType !== "gd"
      ? await pdfToBuffer((pt) => Promise.resolve(generateSsccLabel(ssccLabels, pt)))
      : null;

    let finalBuf: Buffer;
    if (gdBuf && ssccBuf) {
      // Merge: GD label + SSCC label for each pallet interleaved
      const merged = await PDFDocument.create();
      for (let i = 0; i < pallets.length; i++) {
        // GD page i
        const gdSrc = await PDFDocument.load(gdBuf);
        const gdPages = await merged.copyPages(gdSrc, [i]);
        for (const pg of gdPages) merged.addPage(pg);
        // SSCC page i
        const ssccSrc = await PDFDocument.load(ssccBuf);
        const ssccPages = await merged.copyPages(ssccSrc, [i]);
        for (const pg of ssccPages) merged.addPage(pg);
      }
      finalBuf = Buffer.from(await merged.save());
    } else {
      finalBuf = (gdBuf ?? ssccBuf)!;
    }

    const filename = labelType === "sscc" ? "sscc-labels" : labelType === "both" ? "gd-and-sscc-labels" : "gd-pallet-labels";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}-session-${sessionId}.pdf"`);
    res.end(finalBuf);
  });
}
