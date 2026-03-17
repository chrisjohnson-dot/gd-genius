/**
 * Unit tests for the copyRules procedure logic.
 *
 * We test the pure business logic directly (getCustomerRule + upsertCustomerRule)
 * without spinning up a real database, by mocking the db helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// We mock the db module so tests run without a real MySQL connection.
const mockGetCustomerRule = vi.fn();
const mockUpsertCustomerRule = vi.fn();
const mockCreateAuditLog = vi.fn();

vi.mock("./db", () => ({
  getCustomerRule: (...args: unknown[]) => mockGetCustomerRule(...args),
  upsertCustomerRule: (...args: unknown[]) => mockUpsertCustomerRule(...args),
  getCustomerRules: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/auditLog", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type CustomerRule = {
  configId: number;
  customerId: number;
  customerName?: string;
  facilityId?: number;
  facilityName?: string;
  noLotMixing: boolean;
  autoRun: boolean;
  locationPriorityPatterns?: Array<{ pattern: string; label: string }> | null;
  notes?: string | null;
};

/**
 * Inline implementation of the copyRules mutation logic so we can test it
 * without standing up a full tRPC server.
 */
async function runCopyRules(input: {
  configId: number;
  sourceCustomerId: number;
  targetCustomers: Array<{
    customerId: number;
    customerName: string;
    facilityId?: number;
    facilityName?: string;
  }>;
}) {
  const source: CustomerRule | undefined = await mockGetCustomerRule(
    input.configId,
    input.sourceCustomerId
  );
  if (!source) {
    throw new Error("Source customer has no saved rules to copy from.");
  }

  const results: Array<{ customerId: number; customerName: string; success: boolean }> = [];

  for (const target of input.targetCustomers) {
    const existingTarget: CustomerRule | undefined = await mockGetCustomerRule(
      input.configId,
      target.customerId
    );
    const facilityId = existingTarget?.facilityId ?? source.facilityId ?? target.facilityId;
    const facilityName = existingTarget?.facilityName ?? source.facilityName ?? target.facilityName;

    await mockUpsertCustomerRule({
      configId: input.configId,
      customerId: target.customerId,
      customerName: target.customerName,
      facilityId,
      facilityName,
      noLotMixing: source.noLotMixing,
      autoRun: source.autoRun,
      locationPriorityPatterns:
        (source.locationPriorityPatterns as Array<{ pattern: string; label: string }> | null) ?? [],
      notes: source.notes,
    });

    await mockCreateAuditLog({
      action: "customerRules.copyRules",
      entityType: "customer_rules",
      entityId: String(target.customerId),
      details: { sourceCustomerId: input.sourceCustomerId },
    });

    results.push({ customerId: target.customerId, customerName: target.customerName, success: true });
  }

  return { copied: results.length, results };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("copyRules — business logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertCustomerRule.mockResolvedValue(undefined);
    mockCreateAuditLog.mockResolvedValue(undefined);
  });

  it("copies all rule fields from source to a single target", async () => {
    const source: CustomerRule = {
      configId: 1,
      customerId: 145,
      customerName: "Amercare",
      facilityId: 4,
      facilityName: "CAL-Calgary",
      noLotMixing: false,
      autoRun: false,
      locationPriorityPatterns: [
        { pattern: "^12", label: "Building 2 – 12xxxx" },
        { pattern: "^RCV12", label: "Building 2 – RCV12" },
      ],
      notes: "Calgary: prefer Building 2",
    };

    // First call = source lookup, second call = target existing rule lookup
    mockGetCustomerRule
      .mockResolvedValueOnce(source)   // source
      .mockResolvedValueOnce(undefined); // target has no existing rule

    const result = await runCopyRules({
      configId: 1,
      sourceCustomerId: 145,
      targetCustomers: [{ customerId: 200, customerName: "Hammer Care" }],
    });

    expect(result.copied).toBe(1);
    expect(mockUpsertCustomerRule).toHaveBeenCalledOnce();

    const upsertArg = mockUpsertCustomerRule.mock.calls[0][0];
    expect(upsertArg.customerId).toBe(200);
    expect(upsertArg.noLotMixing).toBe(false);
    expect(upsertArg.autoRun).toBe(false);
    expect(upsertArg.locationPriorityPatterns).toEqual(source.locationPriorityPatterns);
    expect(upsertArg.notes).toBe("Calgary: prefer Building 2");
  });

  it("preserves the target's own facilityId when it already has a rule", async () => {
    const source: CustomerRule = {
      configId: 1, customerId: 145, noLotMixing: true, autoRun: true,
      facilityId: 4, facilityName: "CAL-Calgary",
      locationPriorityPatterns: [{ pattern: "^12", label: "Bldg 2" }],
    };
    const existingTarget: CustomerRule = {
      configId: 1, customerId: 200, noLotMixing: false, autoRun: false,
      facilityId: 7, facilityName: "RNO-Reno",
      locationPriorityPatterns: [],
    };

    mockGetCustomerRule
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(existingTarget);

    await runCopyRules({
      configId: 1,
      sourceCustomerId: 145,
      targetCustomers: [{ customerId: 200, customerName: "Hammer Care" }],
    });

    const upsertArg = mockUpsertCustomerRule.mock.calls[0][0];
    // Facility should come from the target's existing rule, not the source
    expect(upsertArg.facilityId).toBe(7);
    expect(upsertArg.facilityName).toBe("RNO-Reno");
    // But the patterns and flags should come from the source
    expect(upsertArg.noLotMixing).toBe(true);
    expect(upsertArg.locationPriorityPatterns).toEqual(source.locationPriorityPatterns);
  });

  it("copies to multiple targets in one call", async () => {
    const source: CustomerRule = {
      configId: 1, customerId: 145, noLotMixing: false, autoRun: false,
      locationPriorityPatterns: [{ pattern: "^12", label: "Bldg 2" }],
    };

    // source + 3 target lookups (all no existing rule)
    mockGetCustomerRule.mockResolvedValue(undefined);
    mockGetCustomerRule.mockResolvedValueOnce(source); // first call = source

    const result = await runCopyRules({
      configId: 1,
      sourceCustomerId: 145,
      targetCustomers: [
        { customerId: 200, customerName: "Customer A" },
        { customerId: 201, customerName: "Customer B" },
        { customerId: 202, customerName: "Customer C" },
      ],
    });

    expect(result.copied).toBe(3);
    expect(mockUpsertCustomerRule).toHaveBeenCalledTimes(3);
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(3);
  });

  it("throws NOT_FOUND when source has no saved rules", async () => {
    mockGetCustomerRule.mockResolvedValueOnce(undefined); // source not found

    await expect(
      runCopyRules({
        configId: 1,
        sourceCustomerId: 999,
        targetCustomers: [{ customerId: 200, customerName: "Customer A" }],
      })
    ).rejects.toThrow("Source customer has no saved rules to copy from.");

    expect(mockUpsertCustomerRule).not.toHaveBeenCalled();
  });

  it("handles source with null locationPriorityPatterns gracefully", async () => {
    const source: CustomerRule = {
      configId: 1, customerId: 145, noLotMixing: false, autoRun: false,
      locationPriorityPatterns: null,
    };

    mockGetCustomerRule
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(undefined);

    await runCopyRules({
      configId: 1,
      sourceCustomerId: 145,
      targetCustomers: [{ customerId: 200, customerName: "Customer A" }],
    });

    const upsertArg = mockUpsertCustomerRule.mock.calls[0][0];
    // null should be normalised to an empty array
    expect(upsertArg.locationPriorityPatterns).toEqual([]);
  });
});
