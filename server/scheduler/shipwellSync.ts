/**
 * Shipwell Status Sync Scheduler
 *
 * Runs every 15 minutes to:
 * 1. Find all tracked orders that have a Shipwell Shipment ID
 * 2. Poll Shipwell for their live status
 * 3. Update the shipwellStatus field in order_tracking
 * 4. Remove orders from tracking when Shipwell marks them as Delivered
 *
 * Also exposes syncShipwellStatusNow() for manual on-demand sync.
 */

import cron from "node-cron";
import {
  getShipwellConfig,
  getOrdersWithShipwellShipment,
  updateShipwellStatus,
  removeTrackedOrder,
} from "../db";
import { createShipwellClient } from "../shipwell/api";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncSummary: string | null = null;

// ─── Core sync function ───────────────────────────────────────────────────────

export async function syncShipwellStatusNow(): Promise<{
  success: boolean;
  updated: number;
  removed: number;
  message: string;
}> {
  if (syncRunning) {
    return { success: false, updated: 0, removed: 0, message: "Shipwell sync already in progress" };
  }
  syncRunning = true;
  let updated = 0;
  let removed = 0;

  try {
    // Get the active Shipwell config
    const config = await getShipwellConfig();
    if (!config || !config.email || !config.password) {
      syncRunning = false;
      return { success: true, updated: 0, removed: 0, message: "No Shipwell config — skipping" };
    }

    // Get all orders that have been sent to Shipwell with a shipment ID
    const orders = await getOrdersWithShipwellShipment();
    if (orders.length === 0) {
      syncRunning = false;
      return { success: true, updated: 0, removed: 0, message: "No orders with Shipwell shipment IDs" };
    }

    // Build Shipwell client
    const client = createShipwellClient({
      email: config.email,
      password: config.password,
      environment: config.environment as "sandbox" | "production",
    });

    // Collect unique shipment IDs
    const shipmentIds = orders
      .map((o) => o.shipwellShipmentId)
      .filter((id): id is string => !!id);

    if (shipmentIds.length === 0) {
      syncRunning = false;
      return { success: true, updated: 0, removed: 0, message: "No shipment IDs to poll" };
    }

    // Batch-poll Shipwell for live statuses
    const statusMap = await client.batchGetShipmentStatuses(shipmentIds);

    // Process results
    for (const order of orders) {
      if (!order.shipwellShipmentId) continue;
      const result = statusMap.get(order.shipwellShipmentId);
      if (!result) continue;

      if (result.isDelivered) {
        // Remove the order from the tracking table — it's done
        await removeTrackedOrder(order.extensivOrderId);
        removed++;
        console.log(`[ShipwellSync] Order ${order.extensivOrderId} (${order.referenceNum}) delivered — removed from tracking`);
      } else {
        // Update the live status
        const newStatus = result.normalizedStatus;
        if (newStatus !== order.shipwellStatus) {
          await updateShipwellStatus(order.extensivOrderId, newStatus);
          updated++;
        }
      }
    }

    lastSyncAt = new Date();
    lastSyncSummary = `Updated ${updated}, removed ${removed} delivered orders`;
    console.log(`[ShipwellSync] ${lastSyncSummary}`);
    return { success: true, updated, removed, message: lastSyncSummary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ShipwellSync] Error:", msg);
    return { success: false, updated, removed, message: `Error: ${msg}` };
  } finally {
    syncRunning = false;
  }
}

// ─── Status accessors ─────────────────────────────────────────────────────────

export function getShipwellSyncStatus(): {
  running: boolean;
  lastSyncAt: Date | null;
  lastSyncSummary: string | null;
} {
  return { running: syncRunning, lastSyncAt, lastSyncSummary };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/** Start the Shipwell status sync scheduler (every 15 minutes). */
export function startShipwellSyncScheduler(): void {
  // Run every 15 minutes
  cron.schedule("0 */15 * * * *", async () => {
    console.log("[ShipwellSync] Running scheduled Shipwell status sync...");
    await syncShipwellStatusNow();
  });
  console.log("[ShipwellSync] Shipwell status sync scheduler started (every 15 min)");
}
