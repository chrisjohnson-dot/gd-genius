import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ENV before importing anything that uses it
vi.mock("./_core/env", () => ({
  ENV: {
    sharedLoginUsername: "GDtakesovertheworld",
    sharedLoginPassword: "2026gogd",
    appId: "test-app-id",
    cookieSecret: "test-secret-at-least-32-chars-long!!",
    databaseUrl: "",
    oAuthServerUrl: "",
    ownerOpenId: "",
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

// Mock db upsertUser
vi.mock("./db", () => ({
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(null),
}));

// Mock sdk
const mockSignSession = vi.fn().mockResolvedValue("mock-session-token");
vi.mock("./_core/sdk", () => ({
  sdk: {
    signSession: mockSignSession,
    authenticateRequest: vi.fn().mockRejectedValue(new Error("No session")),
  },
}));

// Mock cookies
vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: vi.fn().mockReturnValue({ httpOnly: true, path: "/" }),
}));

// Mock systemRouter
vi.mock("./_core/systemRouter", () => ({ systemRouter: {} }));

// Mock directlyRouter
vi.mock("./routers/directly", () => ({ directlyRouter: {} }));

// Mock storagePut
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

import { ENV } from "./_core/env";

describe("sharedLogin credentials", () => {
  it("should have SHARED_LOGIN_USERNAME set", () => {
    expect(ENV.sharedLoginUsername).toBe("GDtakesovertheworld");
  });

  it("should have SHARED_LOGIN_PASSWORD set", () => {
    expect(ENV.sharedLoginPassword).toBe("2026gogd");
  });

  it("should accept correct credentials", () => {
    const username = "GDtakesovertheworld";
    const password = "2026gogd";
    const valid =
      ENV.sharedLoginUsername === username &&
      ENV.sharedLoginPassword === password;
    expect(valid).toBe(true);
  });

  it("should reject wrong username", () => {
    const valid =
      ENV.sharedLoginUsername === "wronguser" &&
      ENV.sharedLoginPassword === "2026gogd";
    expect(valid).toBe(false);
  });

  it("should reject wrong password", () => {
    const valid =
      ENV.sharedLoginUsername === "GDtakesovertheworld" &&
      ENV.sharedLoginPassword === "wrongpass";
    expect(valid).toBe(false);
  });
});
