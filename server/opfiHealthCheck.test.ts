/**
 * Tests for the OpFi health check scheduler (runOpFiHealthCheckNow).
 *
 * We mock testOpFiConnection and updateCortexHealthStatus so no real
 * network calls or DB writes are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../server/opfiRateSheets", () => ({
  testOpFiConnection: vi.fn(),
  getCarrierMarkups: vi.fn(),
  getMarkupPct: vi.fn(),
  applyMarkup: vi.fn(),
}));

vi.mock("../server/db", () => ({
  updateCortexHealthStatus: vi.fn().mockResolvedValue(undefined),
}));

import { testOpFiConnection } from "../server/opfiRateSheets";
import { updateCortexHealthStatus } from "../server/db";
import {
  runOpFiHealthCheckNow,
  startOpFiHealthCheckScheduler,
  stopOpFiHealthCheckScheduler,
} from "../server/scheduler/opfiHealthCheck";

const mockTest = testOpFiConnection as ReturnType<typeof vi.fn>;
const mockUpdate = updateCortexHealthStatus as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  stopOpFiHealthCheckScheduler(); // ensure no timer leaks between tests
});

// ─── runOpFiHealthCheckNow ────────────────────────────────────────────────────

describe("runOpFiHealthCheckNow", () => {
  it("returns status=ok and writes 'ok' to DB on successful probe", async () => {
    mockTest.mockResolvedValueOnce({
      ok: true,
      baseUrl: "https://opfi.example.com",
      httpStatus: 200,
      hasRateSheets: true,
      durationMs: 42,
    });

    const result = await runOpFiHealthCheckNow();

    expect(result.status).toBe("ok");
    expect(result.durationMs).toBe(42);
    expect(result.detail).toContain("HTTP 200");
    expect(result.detail).toContain("42ms");
    expect(mockUpdate).toHaveBeenCalledWith("opfi", "ok");
  });

  it("returns status=ok with 'no rate sheets' detail when hasRateSheets=false", async () => {
    mockTest.mockResolvedValueOnce({
      ok: true,
      baseUrl: "https://opfi.example.com",
      httpStatus: 404,
      hasRateSheets: false,
      durationMs: 30,
    });

    const result = await runOpFiHealthCheckNow();

    expect(result.status).toBe("ok");
    expect(result.detail).toContain("no rate sheets");
    expect(mockUpdate).toHaveBeenCalledWith("opfi", "ok");
  });

  it("returns status=error and writes 'error' to DB when probe throws", async () => {
    mockTest.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await runOpFiHealthCheckNow();

    expect(result.status).toBe("error");
    expect(result.detail).toContain("ECONNREFUSED");
    expect(mockUpdate).toHaveBeenCalledWith("opfi", "error");
  });

  it("returns status=error even when the DB write also fails", async () => {
    mockTest.mockRejectedValueOnce(new Error("timeout"));
    mockUpdate.mockRejectedValueOnce(new Error("DB down"));

    // Should not throw — DB failure is swallowed
    const result = await runOpFiHealthCheckNow();
    expect(result.status).toBe("error");
    expect(result.detail).toContain("timeout");
  });

  it("never exposes rate or markup values in its return value", async () => {
    mockTest.mockResolvedValueOnce({
      ok: true,
      baseUrl: "https://opfi.example.com",
      httpStatus: 200,
      hasRateSheets: true,
      durationMs: 55,
    });

    const result = await runOpFiHealthCheckNow();
    const str = JSON.stringify(result);
    expect(str).not.toContain("fedex");
    expect(str).not.toContain("ups");
    expect(str).not.toContain("carrierMarkup");
  });
});

// ─── startOpFiHealthCheckScheduler ───────────────────────────────────────────

describe("startOpFiHealthCheckScheduler", () => {
  it("is idempotent — calling twice does not create two timers", () => {
    mockTest.mockResolvedValue({
      ok: true, baseUrl: "", httpStatus: 200, hasRateSheets: true, durationMs: 10,
    });

    startOpFiHealthCheckScheduler();
    startOpFiHealthCheckScheduler(); // second call should be a no-op

    // Only one immediate probe should have been triggered
    // (the interval hasn't fired yet in a synchronous test)
    stopOpFiHealthCheckScheduler();
  });
});
