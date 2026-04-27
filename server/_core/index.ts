import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerPdfRoutes } from "../pdf/routes";
import { appRouterV4 as appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initScheduler } from "../scheduler/autoRun";
import { startOrderSyncScheduler } from "../scheduler/orderSync";
import { startShipwellSyncScheduler } from "../scheduler/shipwellSync";
import { startOverdueAlertScheduler } from "../scheduler/overdueAlert";
import { registerCortexRoutes } from "../cortex/routes";
import { registerExtensivWebhookRoutes } from "../webhooks/extensiv";
import { registerScanEndpoint } from "../scanEndpoint";
import { registerScanImageEndpoints } from "../scanImageEndpoint";
import { flushPendingWebhooks, flushPendingShipmentPushes } from "../cortex/webhook";
import { startWebhookRetryScheduler } from "../scheduler/webhookRetry";
import { startSlaNightlySnapshot } from "../scheduler/slaNightlySnapshot";
import { startScanImagePurgeScheduler } from "../scheduler/scanImagePurge";
import { startOpFiHealthCheckScheduler } from "../scheduler/opfiHealthCheck";
import { startClearSightRulesSyncScheduler } from "../scheduler/clearsightRulesSync";
import { checkOverdueSessions } from "../routers/pullAlerts";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // PDF export routes
  registerPdfRoutes(app);
  // GD Cortex integration REST endpoints
  registerCortexRoutes(app);
  // Extensiv webhook receiver — POST /api/webhooks/extensiv
  registerExtensivWebhookRoutes(app);
  // Vision system scan endpoint — /api/scan
  registerScanEndpoint(app);
  // Scan image upload/post-apply endpoints — raw body parser must come before JSON
  app.use("/api/scan/image-receive", express.raw({ type: "*/*", limit: "20mb" }));
  registerScanImageEndpoints(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Initialize auto-run scheduler after server is up
    initScheduler().catch((err) => console.error("[Scheduler] Init failed:", err));
    // Initialize hourly order sync scheduler
    startOrderSyncScheduler();
    // Initialize Shipwell status sync scheduler (every 15 min)
    startShipwellSyncScheduler();
    // Initialize daily overdue order alert (time read from DB)
    startOverdueAlertScheduler().catch((err) => console.error("[OverdueAlert] Init failed:", err));
    // Flush any pending Cortex webhooks every 5 minutes
    setInterval(() => flushPendingWebhooks(), 5 * 60 * 1000);
    // Flush any pending ClearSight shipment pushes every 30 minutes
    setInterval(() => flushPendingShipmentPushes(), 30 * 60 * 1000);
    // Retry failed ClearSight webhook pushes with exponential backoff (1min, 5min, 15min)
    startWebhookRetryScheduler();
    // Record nightly SLA rate snapshots for all facilities at midnight UTC
    startSlaNightlySnapshot();
    // Nightly scan image retention purge at 02:00 UTC
    startScanImagePurgeScheduler();
    // OpFi connection health check every 15 minutes
    startOpFiHealthCheckScheduler();
    // Nightly ClearSight retailer rules sync at 02:30 UTC (stub — activates when ClearSight endpoint is ready)
    startClearSightRulesSyncScheduler();
    // Pull session overdue alert check every 5 minutes
    const runPullAlertCheck = () => {
      checkOverdueSessions()
        .then((fired) => {
          if (fired > 0) console.log(`[PullAlerts] Fired ${fired} overdue session alert(s).`);
        })
        .catch((err) => console.error("[PullAlerts] Check failed:", err));
    };
    runPullAlertCheck(); // run once immediately on startup
    setInterval(runPullAlertCheck, 5 * 60 * 1000);
  });
}

startServer().catch(console.error);
