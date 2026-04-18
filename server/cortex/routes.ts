/**
 * GD Cortex Integration — REST API endpoints for GD Genius
 *
 * These endpoints are consumed by GD ClearSight (and potentially GD OpFi).
 * Authentication: X-API-Key header matched against the stored inboundApiKey
 * for the calling platform.
 *
 * Endpoints:
 *   GET  /api/health                     — Health check (no auth)
 *   POST /api/returns                    — Receive return request from ClearSight
 *   GET  /api/returns/processed          — ClearSight polls for processed returns
 */

import type { Express, Request, Response } from "express";
import {
  getCortexConnection,
  createCortexReturn,
  getCortexReturnByReturnNumber,
  getProcessedCortexReturns,
  updateCortexReturn,
  upsertReturnClientInstruction,
  updateReturnsItemApproval,
} from "../db";
import { fireCortexWebhook } from "./webhook";

// ─── API Key middleware ────────────────────────────────────────────────────────

async function requireApiKey(
  req: Request,
  res: Response,
  platform: string
): Promise<boolean> {
  const key = req.headers["x-api-key"];
  if (!key) {
    res.status(401).json({ error: "Missing X-API-Key header" });
    return false;
  }
  const conn = await getCortexConnection(platform);
  if (!conn || !conn.inboundApiKey) {
    res.status(401).json({ error: "Platform not configured" });
    return false;
  }
  if (key !== conn.inboundApiKey) {
    res.status(401).json({ error: "Invalid API key" });
    return false;
  }
  return true;
}

// ─── Route registration ────────────────────────────────────────────────────────

export function registerCortexRoutes(app: Express): void {
  // ── Health check (no auth) ────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", platform: "genius", version: "1.0.0" });
  });

  // ── Receive return request from ClearSight ────────────────────────────────
  app.post("/api/returns", async (req: Request, res: Response) => {
    if (!(await requireApiKey(req, res, "clearsight"))) return;

    const body = req.body as {
      returnNumber?: string;
      orderId?: string;
      orderNumber?: string;
      customerId?: string;
      customerName?: string;
      extensivCustomerId?: number;
      reason?: string;
      items?: unknown[];
      shippingAddress?: unknown;
      notes?: string;
      createdAt?: string;
    };

    if (!body.returnNumber) {
      res.status(400).json({ error: "returnNumber is required" });
      return;
    }

    // Idempotency: if we already have this returnNumber, return the existing record
    const existing = await getCortexReturnByReturnNumber(body.returnNumber);
    if (existing) {
      res.json({
        success: true,
        geniusReturnId: `genius-${existing.id}`,
        status: existing.status,
        message: "Return request already exists",
      });
      return;
    }

    try {
      const id = await createCortexReturn({
        returnNumber: body.returnNumber,
        orderId: body.orderId ?? null,
        orderNumber: body.orderNumber ?? null,
        customerId: body.customerId ?? null,
        customerName: body.customerName ?? "",
        extensivCustomerId: body.extensivCustomerId ?? null,
        reason: body.reason ?? null,
        items: body.items ?? null,
        shippingAddress: body.shippingAddress ?? null,
        notes: body.notes ?? null,
        status: "Received",
        inspectionResult: null,
        disposition: null,
        refundAmount: null,
        refundApproved: null,
        processedBy: null,
        processedAt: null,
        returnsSessionId: null,
        webhookSent: false,
        clearsightCreatedAt: body.createdAt ? new Date(body.createdAt) : null,
      });

      // Fire webhook back to ClearSight: return.received
      await fireCortexWebhook("clearsight", "return.received", {
        geniusReturnId: `genius-${id}`,
        returnNumber: body.returnNumber,
        status: "Received",
        processedAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        geniusReturnId: `genius-${id}`,
        status: "Received",
        message: "Return request received and queued for processing",
      });
    } catch (err) {
      console.error("[Cortex] POST /api/returns error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Get processed returns (ClearSight polls) ──────────────────────────────
  app.get("/api/returns/processed", async (req: Request, res: Response) => {
    if (!(await requireApiKey(req, res, "clearsight"))) return;

    const sinceParam = req.query.since as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 500) : 100;

    if (sinceParam && isNaN(since!.getTime())) {
      res.status(400).json({ error: "Invalid since parameter — use ISO 8601 format" });
      return;
    }

    try {
      const rows = await getProcessedCortexReturns(since, limit + 1);
      const hasMore = rows.length > limit;
      const results = rows.slice(0, limit);

      const returns = results.map((r) => ({
        geniusReturnId: `genius-${r.id}`,
        returnNumber: r.returnNumber,
        status: r.status,
        inspectionResult: r.inspectionResult ?? null,
        disposition: r.disposition ?? null,
        refundAmount: r.refundAmount ? Number(r.refundAmount) : null,
        refundApproved: r.refundApproved ?? null,
        processedBy: r.processedBy ?? null,
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        notes: r.notes ?? null,
        photos: [],
      }));

      res.json({ returns, totalResults: returns.length, hasMore });
    } catch (err) {
      console.error("[Cortex] GET /api/returns/processed error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Internal: update return status (called from Process Returns UI) ───────
  // This is a tRPC-adjacent helper used by the returns workflow to mark a
  // ClearSight-originated return as Processed when the session is closed.
  app.post("/api/cortex/internal/update-return", async (req: Request, res: Response) => {
    // Internal endpoint — require session cookie auth (same as tRPC)
    // For simplicity we check a shared internal token header
    const internalToken = req.headers["x-internal-token"];
    if (internalToken !== process.env.JWT_SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { cortexReturnId, status, inspectionResult, disposition, refundAmount, refundApproved, processedBy } = req.body as {
      cortexReturnId: number;
      status: string;
      inspectionResult?: string;
      disposition?: string;
      refundAmount?: number;
      refundApproved?: boolean;
      processedBy?: string;
    };

    if (!cortexReturnId || !status) {
      res.status(400).json({ error: "cortexReturnId and status are required" });
      return;
    }

    try {
      await updateCortexReturn(cortexReturnId, {
        status,
        inspectionResult: inspectionResult ?? null,
        disposition: disposition ?? null,
        refundAmount: refundAmount != null ? String(refundAmount) : null,
        refundApproved: refundApproved ?? null,
        processedBy: processedBy ?? null,
        processedAt: new Date(),
        webhookSent: false,
      });

      // Fire webhook to ClearSight
      const eventMap: Record<string, string> = {
        Processed: "return.processed",
        Refunded: "return.refunded",
        Rejected: "return.rejected",
        Restocked: "return.processed",
        Inspecting: "return.inspecting",
      };
      const event = eventMap[status] ?? "return.processed";
      await fireCortexWebhook("clearsight", event, {
        cortexReturnId,
        status,
        disposition: disposition ?? null,
        refundAmount: refundAmount ?? null,
        refundApproved: refundApproved ?? null,
        processedBy: processedBy ?? null,
        processedAt: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("[Cortex] internal update-return error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Receive client approval decision from ClearSight ─────────────────────
  // ClearSight POSTs this when the client approves/rejects/questions/flags a
  // restock item from a closed returns session.
  //
  // Body:
  //   sessionId          number   — GD Genius returns_sessions.id
  //   clientId           number?  — ClearSight client ID
  //   clientName         string?  — Human-readable client name
  //   items              array?   — one entry per restock item
  //     itemId           number   — returns_items.id
  //     sku              string
  //     approvalStatus   "approved"|"rejected"|"questioned"|"flagged"
  //     note             string?  — optional client message
  //   instructions       array?   — optional session-level messages
  //     message          string
  //     itemId           number?
  //     approvalStatus   string?
  //     clearsightInstructionId  string?  — idempotency key
  app.post("/api/returns/approval", async (req: Request, res: Response) => {
    if (!(await requireApiKey(req, res, "clearsight"))) return;

    const body = req.body as {
      sessionId: number;
      clientId?: number;
      clientName?: string;
      items?: Array<{
        itemId: number;
        sku: string;
        approvalStatus: "approved" | "rejected" | "questioned" | "flagged";
        note?: string;
      }>;
      instructions?: Array<{
        message: string;
        itemId?: number;
        approvalStatus?: "approved" | "rejected" | "questioned" | "flagged";
        clearsightInstructionId?: string;
      }>;
    };

    if (!body.sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    try {
      const clientId = body.clientId ?? 0;
      const clientName = body.clientName ?? "";
      let itemsUpdated = 0;
      let instructionsCreated = 0;

      // 1. Update approval status on each item
      if (Array.isArray(body.items)) {
        for (const item of body.items) {
          if (!item.itemId || !item.approvalStatus) continue;
          await updateReturnsItemApproval(item.itemId, item.approvalStatus, item.note ?? null);
          itemsUpdated++;
          // Auto-create an instruction row for non-approved decisions so associates see them
          if (item.approvalStatus !== "approved") {
            await upsertReturnClientInstruction({
              sessionId: body.sessionId,
              itemId: item.itemId,
              clientId,
              clientName,
              message: item.note ?? `Item ${item.sku} was ${item.approvalStatus} by client`,
              approvalStatus: item.approvalStatus,
              isRead: false,
              readAt: null,
              readByName: null,
              clearsightInstructionId: null,
            });
            instructionsCreated++;
          }
        }
      }

      // 2. Store any explicit session-level instructions
      if (Array.isArray(body.instructions)) {
        for (const instr of body.instructions) {
          if (!instr.message) continue;
          await upsertReturnClientInstruction({
            sessionId: body.sessionId,
            itemId: instr.itemId ?? null,
            clientId,
            clientName,
            message: instr.message,
            approvalStatus: instr.approvalStatus ?? null,
            isRead: false,
            readAt: null,
            readByName: null,
            clearsightInstructionId: instr.clearsightInstructionId ?? null,
          });
          instructionsCreated++;
        }
      }

      console.log(
        `[Cortex] /api/returns/approval session=${body.sessionId} itemsUpdated=${itemsUpdated} instructionsCreated=${instructionsCreated}`
      );
      res.json({ success: true, itemsUpdated, instructionsCreated });
    } catch (err) {
      console.error("[Cortex] /api/returns/approval error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
