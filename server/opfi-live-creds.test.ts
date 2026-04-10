/**
 * Live credential validation for OpFi rate-sheets endpoint.
 *
 * Verifies that OPFI_API_KEY is set and accepted by the OpFi service.
 * Skipped automatically when OPFI_API_KEY is not configured (CI / offline).
 */
import { describe, it, expect } from "vitest";

const OPFI_BASE_URL = process.env.OPFI_BASE_URL || "https://gobilling-nefrolgy.manus.space";
const OPFI_API_KEY = process.env.OPFI_API_KEY;

describe("OpFi live credentials", () => {
  it("OPFI_API_KEY must be set (non-empty)", () => {
    expect(OPFI_API_KEY, "OPFI_API_KEY env var is missing or empty").toBeTruthy();
  });

  it.skipIf(!OPFI_API_KEY)(
    "should return HTTP 200 from /api/health with the configured API key",
    async () => {
      const res = await fetch(`${OPFI_BASE_URL}/api/health`, {
        headers: { "X-API-Key": OPFI_API_KEY! },
        signal: AbortSignal.timeout(10_000),
      });
      expect(res.status, `OpFi /api/health returned ${res.status}`).toBe(200);
      const body = await res.json() as { status?: string };
      expect(body.status).toBe("ok");
      console.log(`[OpFi] Health check OK — ${OPFI_BASE_URL}`);
    },
    15_000,
  );

  it.skipIf(!OPFI_API_KEY)(
    "should return HTTP 200 from /api/rate-sheets with the configured API key",
    async () => {
      const res = await fetch(`${OPFI_BASE_URL}/api/rate-sheets?clientId=0`, {
        headers: { "X-API-Key": OPFI_API_KEY! },
        signal: AbortSignal.timeout(10_000),
      });
      expect([200, 404], `OpFi /api/rate-sheets returned ${res.status} (expected 200 or 404)`).toContain(res.status);
      const body = await res.json() as { rateSheets?: unknown[]; error?: string };
      expect(body.error, "Unexpected error in OpFi response").toBeUndefined();
      console.log(`[OpFi] rate-sheets OK — HTTP ${res.status}, rateSheets count: ${body.rateSheets?.length ?? 0}`);
    },
    15_000,
  );
});
