/**
 * Scan Image REST endpoints
 *
 * GET  /api/scan/image-upload-url
 *   Returns a pre-signed S3 PUT URL for the edge compute to upload a camera image.
 *   Query params: carton_id (required), camera (a|b|c), content_type (default image/jpeg)
 *   Response: { upload_url, s3_key, carton_id, camera }
 *
 * POST /api/scan/post-apply
 *   Called by the edge compute ~500ms after tamp fires, with Camera C image already
 *   uploaded to S3 (via the upload-url flow).  Updates the production_scan record
 *   with the post-apply image URL and timestamp.
 *   Body: { carton_id, s3_key, line_id? }
 *   Response: { status, carton_id, scan_id }
 *
 * Both endpoints require the same X-API-Key header as /api/scan.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getLabelScanSettings } from "./db";
import {
  getProductionScanByCartonId,
  updateProductionScanImages,
} from "./db";
import { storagePut, storageGet } from "./storage";

// ── helpers ───────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  return crypto.randomBytes(6).toString("hex");
}

function buildS3Key(cartonId: string, camera: string, contentType: string): string {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `scan-images/${date}/${cartonId}-cam${camera.toUpperCase()}-${randomSuffix()}.${ext}`;
}

/** Verify the X-API-Key header against the configured scanApiKey */
async function verifyApiKey(req: Request): Promise<boolean> {
  const settings = await getLabelScanSettings();
  if (!settings?.scanApiKey) return true; // no key configured → open
  const provided = req.headers["x-api-key"] as string | undefined;
  return provided === settings.scanApiKey;
}

// ── router ────────────────────────────────────────────────────────────────────

export function registerScanImageEndpoints(app: Router): void {
  /**
   * GET /api/scan/image-upload-url
   * Returns a pre-signed S3 PUT URL so the edge compute can upload the JPEG directly.
   * After uploading, the edge compute calls POST /api/scan/post-apply (for Camera C)
   * or PATCH /api/scan/image-confirm (for Cameras A/B) with the returned s3_key.
   */
  (app as any).get("/api/scan/image-upload-url", async (req: Request, res: Response) => {
    if (!(await verifyApiKey(req))) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const cartonId = req.query.carton_id as string | undefined;
    const camera = ((req.query.camera as string) ?? "a").toLowerCase();
    const contentType = (req.query.content_type as string) ?? "image/jpeg";

    if (!cartonId) {
      return res.status(400).json({ error: "carton_id is required" });
    }
    if (!["a", "b", "c"].includes(camera)) {
      return res.status(400).json({ error: "camera must be a, b, or c" });
    }

    // For Camera C, check that it is commissioned (camCIp is set)
    if (camera === "c") {
      const settings = await getLabelScanSettings();
      if (!settings?.camCIp) {
        return res.status(503).json({
          error: "Camera C not yet commissioned",
          detail: "Set camCIp in Label Scan Settings to enable post-apply verification",
        });
      }
    }

    const s3Key = buildS3Key(cartonId, camera, contentType);

    // We use storagePut with an empty buffer to pre-register the key and get the URL.
    // The actual image bytes will be uploaded by the edge compute via the returned URL.
    // Since the Manus storage proxy does not support pre-signed PUT URLs directly,
    // we return a POST URL to our own /api/scan/image-receive endpoint instead.
    // The edge compute POSTs the raw image bytes there.
    const uploadEndpoint = `/api/scan/image-receive?carton_id=${encodeURIComponent(cartonId)}&camera=${camera}&s3_key=${encodeURIComponent(s3Key)}&content_type=${encodeURIComponent(contentType)}`;

    return res.status(200).json({
      upload_url: uploadEndpoint,
      s3_key: s3Key,
      carton_id: cartonId,
      camera,
      method: "POST",
      note: "POST raw image bytes to upload_url with Content-Type header set",
    });
  });

  /**
   * POST /api/scan/image-receive
   * Receives raw image bytes from the edge compute, uploads to S3, and updates
   * the production_scan record with the image URL.
   * Query params: carton_id, camera (a|b|c), s3_key, content_type
   * Body: raw image bytes (JPEG or PNG)
   */
  (app as any).post("/api/scan/image-receive", async (req: Request, res: Response) => {
    if (!(await verifyApiKey(req))) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const cartonId = req.query.carton_id as string | undefined;
    const camera = ((req.query.camera as string) ?? "a").toLowerCase();
    const s3Key = req.query.s3_key as string | undefined;
    const contentType = (req.query.content_type as string) ?? "image/jpeg";

    if (!cartonId || !s3Key) {
      return res.status(400).json({ error: "carton_id and s3_key are required" });
    }

    // req.body is the raw buffer (express.raw middleware must be applied upstream)
    const imageBuffer: Buffer = req.body;
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      return res.status(400).json({ error: "Request body must be raw image bytes" });
    }

    try {
      const { url } = await storagePut(s3Key, imageBuffer, contentType);

      // Update the production_scan record
      const scan = await getProductionScanByCartonId(cartonId);
      if (scan) {
        const updates: Record<string, string | Date> = {};
        if (camera === "a") { updates.camAImageUrl = url; updates.camAImageKey = s3Key; }
        else if (camera === "b") { updates.camBImageUrl = url; updates.camBImageKey = s3Key; }
        else if (camera === "c") {
          updates.postApplyImageUrl = url;
          updates.postApplyImageKey = s3Key;
          updates.postApplyReceivedAt = new Date();
        }
        await updateProductionScanImages(scan.scanId, updates);
      }

      return res.status(200).json({
        status: "stored",
        carton_id: cartonId,
        camera,
        s3_key: s3Key,
        url,
        scan_id: scan?.scanId ?? null,
      });
    } catch (err: any) {
      console.error("[ScanImage] Upload failed:", err?.message);
      return res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  /**
   * POST /api/scan/post-apply
   * Convenience endpoint for Camera C: the edge compute sends the s3_key of an
   * already-uploaded image (or sends raw bytes if preferred).
   * Body: { carton_id, s3_key } — s3_key was obtained from /api/scan/image-upload-url
   */
  (app as any).post("/api/scan/post-apply", async (req: Request, res: Response) => {
    if (!(await verifyApiKey(req))) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const settings = await getLabelScanSettings();
    if (!settings?.camCIp) {
      return res.status(503).json({
        error: "Camera C not yet commissioned",
        detail: "Set camCIp in Label Scan Settings to enable post-apply verification",
      });
    }

    const { carton_id: cartonId, s3_key: s3Key } = req.body ?? {};
    if (!cartonId || !s3Key) {
      return res.status(400).json({ error: "carton_id and s3_key are required" });
    }

    try {
      // Get the public URL for the already-uploaded S3 object
      const { url } = await storageGet(s3Key);

      const scan = await getProductionScanByCartonId(cartonId);
      if (!scan) {
        return res.status(404).json({ error: "No production scan found for carton_id" });
      }

      await updateProductionScanImages(scan.scanId, {
        postApplyImageUrl: url,
        postApplyImageKey: s3Key,
        postApplyReceivedAt: new Date(),
      });

      return res.status(200).json({
        status: "post_apply_recorded",
        carton_id: cartonId,
        scan_id: scan.scanId,
        post_apply_image_url: url,
        received_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[PostApply] Error:", err?.message);
      return res.status(500).json({ error: err?.message ?? "Internal error" });
    }
  });
}
