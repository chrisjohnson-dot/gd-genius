/**
 * GD Genius — Cortex Hub Router
 *
 * INSTRUCTIONS:
 * 1. Copy this file to server/routers/cortex-hub.ts in your GD Genius Manus project
 * 2. In server/routers.ts, add:
 *      import { cortexHubRouter } from "./routers/cortex-hub";
 *    Then inside appRouter:
 *      cortexHub: cortexHubRouter,
 * 3. Ensure the 4 new tables from schema-additions.ts are in drizzle/schema.ts
 * 4. Apply migration.sql via webdev_execute_sql
 * 5. Run pnpm test to verify all tests pass
 */

import { eq, desc, gte, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../server/db";
import {
  cortexHubConfig,
  geniusProductionJobs,
  geniusMaterialsInventory,
  geniusCortexEvents,
} from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

// ---------------------------------------------------------------------------
// Helper: validate the X-API-Key header against the stored geniusApiKey
// ---------------------------------------------------------------------------
async function validateApiKey(providedKey: string | undefined): Promise<boolean> {
  if (!providedKey) return false;
  const db = await getDb();
  if (!db) return false;
  const [config] = await db.select().from(cortexHubConfig).limit(1);
  if (!config?.geniusApiKey) return true; // no key configured → open access
  return config.geniusApiKey === providedKey;
}

// ---------------------------------------------------------------------------
// cortexHubRouter
// ---------------------------------------------------------------------------
export const cortexHubRouter = router({

  // -------------------------------------------------------------------------
  // health — PUBLIC
  // GD Cortex calls this to verify Genius is reachable before activating
  // the connection. No auth required.
  // -------------------------------------------------------------------------
  health: publicProcedure.query(async () => {
    const db = await getDb();
    const [config] = db
      ? await db.select().from(cortexHubConfig).limit(1)
      : [null];

    return {
      status: "ok" as const,
      platform: "genius" as const,
      version: "1.0.0",
      connectionConfigured: !!(config?.cortexBaseUrl && config?.cortexApiKey),
      timestamp: new Date().toISOString(),
    };
  }),

  // -------------------------------------------------------------------------
  // getConfig — PROTECTED (Genius admin UI)
  // Returns the current Cortex hub connection config for display in Settings.
  // -------------------------------------------------------------------------
  getConfig: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [config] = await db.select().from(cortexHubConfig).limit(1);
    if (!config) return null;
    return {
      ...config,
      cortexApiKey: config.cortexApiKey
        ? `${config.cortexApiKey.slice(0, 8)}...`
        : null,
      geniusApiKey: config.geniusApiKey
        ? `${config.geniusApiKey.slice(0, 8)}...`
        : null,
    };
  }),

  // -------------------------------------------------------------------------
  // saveConfig — PROTECTED (Genius admin UI)
  // Saves the Cortex base URL and API keys.
  // -------------------------------------------------------------------------
  saveConfig: protectedProcedure
    .input(
      z.object({
        cortexBaseUrl: z.string().url("Must be a valid URL"),
        cortexApiKey: z.string().min(8, "API key must be at least 8 characters"),
        geniusApiKey: z.string().min(8, "API key must be at least 8 characters"),
        syncIntervalMinutes: z.number().int().min(1).max(60).default(5),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .insert(cortexHubConfig)
        .values({ id: 1, ...input, status: "disconnected" })
        .onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });

      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // testConnection — PROTECTED (Genius admin UI)
  // Calls GD Cortex's health endpoint to verify the connection is live.
  // -------------------------------------------------------------------------
  testConnection: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [config] = await db.select().from(cortexHubConfig).limit(1);
    if (!config?.cortexBaseUrl || !config?.cortexApiKey) {
      throw new Error("Cortex connection not configured. Save config first.");
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `${config.cortexBaseUrl}/api/trpc/platforms.health`,
        {
          headers: {
            "X-API-Key": config.cortexApiKey,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        await db
          .update(cortexHubConfig)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(cortexHubConfig.id, 1));
        throw new Error(`Cortex returned HTTP ${res.status}`);
      }

      await db
        .update(cortexHubConfig)
        .set({
          status: "connected",
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(cortexHubConfig.id, 1));

      return { success: true, message: "Connected to GD Cortex successfully" };
    } catch (err: unknown) {
      await db
        .update(cortexHubConfig)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(cortexHubConfig.id, 1));

      const isTimeout = err instanceof Error && err.name === "AbortError";
      throw new Error(
        isTimeout
          ? "Connection timed out — Cortex did not respond within 8 seconds"
          : `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }),

  // -------------------------------------------------------------------------
  // getProduction — PUBLIC (called by GD Cortex)
  // Returns production job records. Cortex polls this on a schedule.
  // -------------------------------------------------------------------------
  getProduction: publicProcedure
    .input(
      z.object({
        apiKey: z.string().optional(),
        clientId: z.number().int().optional(),
        status: z
          .enum(["queued", "in_progress", "completed", "on_hold", "cancelled"])
          .optional(),
        since: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const isValid = await validateApiKey(input.apiKey);
      if (!isValid) throw new Error("Invalid API key");

      const db = await getDb();
      if (!db) return { jobs: [], totalResults: 0, hasMore: false };

      const conditions = [];
      if (input.clientId) {
        conditions.push(
          eq(geniusProductionJobs.extensivCustomerId, input.clientId)
        );
      }
      if (input.status) {
        conditions.push(eq(geniusProductionJobs.status, input.status));
      }
      if (input.since) {
        conditions.push(
          gte(geniusProductionJobs.updatedAt, new Date(input.since))
        );
      }

      const rows =
        conditions.length > 0
          ? await db
              .select()
              .from(geniusProductionJobs)
              .where(and(...conditions))
              .orderBy(desc(geniusProductionJobs.updatedAt))
              .limit(input.limit + 1)
          : await db
              .select()
              .from(geniusProductionJobs)
              .orderBy(desc(geniusProductionJobs.updatedAt))
              .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const jobs = hasMore ? rows.slice(0, input.limit) : rows;

      return { jobs, totalResults: jobs.length, hasMore };
    }),

  // -------------------------------------------------------------------------
  // getJobs — PUBLIC (called by GD Cortex)
  // Alias for getProduction — returns jobs filterable by type.
  // -------------------------------------------------------------------------
  getJobs: publicProcedure
    .input(
      z.object({
        apiKey: z.string().optional(),
        clientId: z.number().int().optional(),
        jobType: z
          .enum([
            "returns_processing",
            "kitting",
            "labeling",
            "repackaging",
            "inspection",
            "other",
          ])
          .optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const isValid = await validateApiKey(input.apiKey);
      if (!isValid) throw new Error("Invalid API key");

      const db = await getDb();
      if (!db) return { jobs: [] };

      const conditions = [];
      if (input.clientId) {
        conditions.push(
          eq(geniusProductionJobs.extensivCustomerId, input.clientId)
        );
      }
      if (input.jobType) {
        conditions.push(eq(geniusProductionJobs.jobType, input.jobType));
      }

      const rows =
        conditions.length > 0
          ? await db
              .select()
              .from(geniusProductionJobs)
              .where(and(...conditions))
              .orderBy(desc(geniusProductionJobs.updatedAt))
              .limit(input.limit)
          : await db
              .select()
              .from(geniusProductionJobs)
              .orderBy(desc(geniusProductionJobs.updatedAt))
              .limit(input.limit);

      return { jobs: rows };
    }),

  // -------------------------------------------------------------------------
  // getMaterials — PUBLIC (called by GD Cortex)
  // Returns materials inventory. Cortex polls this for capacity planning.
  // -------------------------------------------------------------------------
  getMaterials: publicProcedure
    .input(
      z.object({
        apiKey: z.string().optional(),
        clientId: z.number().int().optional(),
        warehouseId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ input }) => {
      const isValid = await validateApiKey(input.apiKey);
      if (!isValid) throw new Error("Invalid API key");

      const db = await getDb();
      if (!db) return { materials: [] };

      const conditions = [];
      if (input.clientId) {
        conditions.push(
          eq(geniusMaterialsInventory.extensivCustomerId, input.clientId)
        );
      }
      if (input.warehouseId) {
        conditions.push(
          eq(geniusMaterialsInventory.warehouseId, input.warehouseId)
        );
      }

      const rows =
        conditions.length > 0
          ? await db
              .select()
              .from(geniusMaterialsInventory)
              .where(and(...conditions))
              .orderBy(desc(geniusMaterialsInventory.updatedAt))
              .limit(input.limit)
          : await db
              .select()
              .from(geniusMaterialsInventory)
              .orderBy(desc(geniusMaterialsInventory.updatedAt))
              .limit(input.limit);

      return { materials: rows };
    }),

  // -------------------------------------------------------------------------
  // receiveEvent — PUBLIC (called by GD Cortex webhook router)
  // Cortex routes events from ClearSight or OpFi to Genius.
  // -------------------------------------------------------------------------
  receiveEvent: publicProcedure
    .input(
      z.object({
        apiKey: z.string().optional(),
        event: z.string(),
        timestamp: z.string(),
        sourcePlatform: z.enum(["cortex", "clearsight", "opfi"]),
        data: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const isValid = await validateApiKey(input.apiKey);
      if (!isValid) throw new Error("Invalid API key");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db.insert(geniusCortexEvents).values({
        eventType: input.event,
        sourcePlatform: input.sourcePlatform,
        payload: input.data as Record<string, unknown>,
        status: "received",
      });

      return {
        success: true,
        message: `Event '${input.event}' from ${input.sourcePlatform} received`,
      };
    }),

  // -------------------------------------------------------------------------
  // getInboundEvents — PROTECTED (Genius admin UI)
  // Lists all inbound events from Cortex for display in the Genius UI.
  // -------------------------------------------------------------------------
  getInboundEvents: protectedProcedure
    .input(
      z.object({
        sourcePlatform: z
          .enum(["cortex", "clearsight", "opfi"])
          .optional(),
        status: z.enum(["received", "processed", "failed"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };

      const conditions = [];
      if (input.sourcePlatform) {
        conditions.push(
          eq(geniusCortexEvents.sourcePlatform, input.sourcePlatform)
        );
      }
      if (input.status) {
        conditions.push(eq(geniusCortexEvents.status, input.status));
      }

      const rows =
        conditions.length > 0
          ? await db
              .select()
              .from(geniusCortexEvents)
              .where(and(...conditions))
              .orderBy(desc(geniusCortexEvents.createdAt))
              .limit(input.limit)
          : await db
              .select()
              .from(geniusCortexEvents)
              .orderBy(desc(geniusCortexEvents.createdAt))
              .limit(input.limit);

      return { events: rows };
    }),

  // -------------------------------------------------------------------------
  // sendWebhook — PROTECTED (Genius admin UI / automated trigger)
  // Sends a webhook to GD Cortex when a production job changes status.
  // -------------------------------------------------------------------------
  sendWebhook: protectedProcedure
    .input(
      z.object({
        event: z.enum([
          "job.created",
          "job.started",
          "job.completed",
          "job.cancelled",
          "return.processed",
          "return.inspected",
          "materials.low_stock",
          "materials.updated",
        ]),
        data: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [config] = await db.select().from(cortexHubConfig).limit(1);
      if (!config?.cortexBaseUrl || !config?.cortexApiKey) {
        throw new Error("Cortex connection not configured");
      }

      const payload = {
        event: input.event,
        timestamp: new Date().toISOString(),
        sourcePlatform: "genius",
        data: input.data,
      };

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(
          `${config.cortexBaseUrl}/api/trpc/webhooks.receive`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": config.cortexApiKey,
            },
            body: JSON.stringify({ json: payload }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`Cortex webhook returned HTTP ${res.status}`);
        }

        return {
          success: true,
          message: `Webhook '${input.event}' delivered to GD Cortex`,
        };
      } catch (err: unknown) {
        const isTimeout = err instanceof Error && err.name === "AbortError";
        throw new Error(
          isTimeout
            ? "Webhook delivery timed out"
            : `Webhook delivery failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }),
});
