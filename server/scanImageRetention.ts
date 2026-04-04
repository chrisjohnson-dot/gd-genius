/**
 * Scan Image Retention Purge Job
 *
 * Runs nightly. Reads scanImageRetentionDays from label_scan_settings.
 * If > 0, finds all production_scan records older than the retention window
 * that still have S3 image keys, deletes the S3 objects, and clears the
 * image URL/key columns in the DB.
 *
 * 0 = never purge (retain forever).
 * Supported values: 60, 90, 180, 365, or any positive integer.
 */
import { getLabelScanSettings } from "./db";
import {
  listOldScanImages,
  clearScanImageColumns,
} from "./db";
import { ENV } from "./_core/env";

interface PurgeResult {
  purgedCount: number;
  skippedCount: number;
  errors: string[];
  retentionDays: number;
  cutoffDate: Date | null;
  ranAt: Date;
}

/**
 * Delete a single S3 object by key using the storage proxy DELETE endpoint.
 * Returns true on success, false if the object was not found (already deleted).
 * Throws on unexpected errors.
 */
async function deleteS3Object(key: string): Promise<boolean> {
  const baseUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Storage proxy credentials missing");
  }
  const url = new URL("v1/storage/delete", baseUrl + "/");
  url.searchParams.set("path", key);
  const resp = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`S3 delete failed (${resp.status}): ${msg}`);
  }
  return true;
}

export async function runScanImageRetentionPurge(): Promise<PurgeResult> {
  const ranAt = new Date();
  const result: PurgeResult = {
    purgedCount: 0,
    skippedCount: 0,
    errors: [],
    retentionDays: 0,
    cutoffDate: null,
    ranAt,
  };

  try {
    const settings = await getLabelScanSettings();
    const retentionDays = settings?.scanImageRetentionDays ?? 60;
    result.retentionDays = retentionDays;

    if (retentionDays === 0) {
      console.log("[ScanImageRetention] Retention set to 0 (never purge). Skipping.");
      return result;
    }

    const cutoff = new Date(ranAt.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    result.cutoffDate = cutoff;
    console.log(
      `[ScanImageRetention] Purging scan images older than ${cutoff.toISOString()} (${retentionDays}d retention)`
    );

    const oldScans = await listOldScanImages(cutoff);
    console.log(`[ScanImageRetention] Found ${oldScans.length} scans with images to purge`);

    const purgedScanIds: string[] = [];

    for (const scan of oldScans) {
      const keys = [scan.camAImageKey, scan.camBImageKey, scan.postApplyImageKey].filter(
        Boolean
      ) as string[];

      let allDeleted = true;
      for (const key of keys) {
        try {
          await deleteS3Object(key);
        } catch (err: any) {
          allDeleted = false;
          result.errors.push(`scanId=${scan.scanId} key=${key}: ${err.message}`);
        }
      }

      if (allDeleted) {
        purgedScanIds.push(scan.scanId);
        result.purgedCount++;
      } else {
        result.skippedCount++;
      }
    }

    // Clear DB columns in batches of 200
    const BATCH = 200;
    for (let i = 0; i < purgedScanIds.length; i += BATCH) {
      await clearScanImageColumns(purgedScanIds.slice(i, i + BATCH));
    }

    console.log(
      `[ScanImageRetention] Done. Purged=${result.purgedCount} Skipped=${result.skippedCount} Errors=${result.errors.length}`
    );
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
    console.error("[ScanImageRetention] Fatal error:", err.message);
  }

  return result;
}
