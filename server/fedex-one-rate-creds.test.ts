/**
 * Validates that the FedEx One Rate credentials (account 942412380) can
 * successfully obtain an OAuth2 access token from the FedEx production API.
 *
 * This test makes a real network request — it will be skipped automatically
 * if the env vars are not set (CI / offline environments).
 */
import { describe, it, expect } from "vitest";

const FEDEX_BASE = "https://apis.fedex.com";

describe("FedEx One Rate credentials", () => {
  const clientId = process.env.FEDEX_ONE_RATE_USER_KEY;
  const clientSecret = process.env.FEDEX_ONE_RATE_PASSWORD;
  const accountNumber = process.env.FEDEX_ONE_RATE_ACCOUNT_NUMBER;

  it.skipIf(!clientId || !clientSecret)(
    "should obtain a valid OAuth2 token from FedEx production API",
    async () => {
      const res = await fetch(`${FEDEX_BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId!,
          client_secret: clientSecret!,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      expect(res.ok, `FedEx token endpoint returned ${res.status}`).toBe(true);

      const data = await res.json() as { access_token?: string; token_type?: string; expires_in?: number };
      expect(typeof data.access_token).toBe("string");
      expect(data.access_token!.length).toBeGreaterThan(10);
      expect(data.token_type?.toLowerCase()).toBe("bearer");

      console.log(`[FedEx One Rate] Token obtained — account ${accountNumber}, expires_in=${data.expires_in}s`);
    },
    20_000, // 20s timeout for network call
  );

  it("should have FEDEX_ONE_RATE_ACCOUNT_NUMBER set to 942412380", () => {
    expect(accountNumber).toBe("942412380");
  });
});
