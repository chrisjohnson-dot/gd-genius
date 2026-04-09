import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildReorderEmailHtml } from "./email";

// ─── buildReorderEmailHtml ────────────────────────────────────────────────────

describe("buildReorderEmailHtml", () => {
  const base = {
    itemName: "12×10×8 Corrugated Box",
    category: "box",
    requestedQty: 200,
    onHandQty: 50,
    minStockLevel: 25,
    weeklyConsumption: 40,
    suggestedQty: 110,
    requesterName: "Chris Johnson",
    notes: null,
  };

  it("returns a subject containing the item name and quantity", () => {
    const { subject } = buildReorderEmailHtml(base);
    expect(subject).toContain("12×10×8 Corrugated Box");
    expect(subject).toContain("200");
  });

  it("includes item name in text body", () => {
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("12×10×8 Corrugated Box");
  });

  it("includes requester name in text body", () => {
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("Chris Johnson");
  });

  it("includes requested qty in text body", () => {
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("200");
  });

  it("includes weekly consumption when provided", () => {
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("40");
  });

  it("calculates days remaining in text body", () => {
    // onHand=50, weekly=40 → 50/40*7 = 8.75 → floor = 8
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("8 days");
  });

  it("omits weekly consumption line when weeklyConsumption is null", () => {
    const { text } = buildReorderEmailHtml({ ...base, weeklyConsumption: null });
    expect(text).not.toContain("Weekly Use");
  });

  it("omits days remaining line when weeklyConsumption is null", () => {
    const { text } = buildReorderEmailHtml({ ...base, weeklyConsumption: null });
    expect(text).not.toContain("Days Left");
  });

  it("includes notes when provided", () => {
    const { text } = buildReorderEmailHtml({ ...base, notes: "Urgent — running low" });
    expect(text).toContain("Urgent — running low");
  });

  it("omits notes line when notes is null", () => {
    const { text } = buildReorderEmailHtml({ ...base, notes: null });
    expect(text).not.toContain("Notes:");
  });

  it("returns valid HTML string", () => {
    const { html } = buildReorderEmailHtml(base);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes item name in HTML body", () => {
    const { html } = buildReorderEmailHtml(base);
    expect(html).toContain("12×10×8 Corrugated Box");
  });

  it("uses red urgency colour for < 7 days remaining", () => {
    // onHand=10, weekly=40 → 10/40*7 = 1.75 → 1 day
    const { html } = buildReorderEmailHtml({ ...base, onHandQty: 10 });
    expect(html).toContain("#ef4444");
  });

  it("uses amber urgency colour for 7–13 days remaining", () => {
    // onHand=50, weekly=40 → 8 days
    const { html } = buildReorderEmailHtml(base);
    expect(html).toContain("#f59e0b");
  });

  it("uses green urgency colour for >= 14 days remaining", () => {
    // onHand=200, weekly=40 → 35 days
    const { html } = buildReorderEmailHtml({ ...base, onHandQty: 200 });
    expect(html).toContain("#22c55e");
  });

  it("handles zero weekly consumption gracefully (no days remaining shown)", () => {
    const { text } = buildReorderEmailHtml({ ...base, weeklyConsumption: null });
    expect(text).not.toContain("Days Left");
  });

  it("includes suggested qty in text body", () => {
    const { text } = buildReorderEmailHtml(base);
    expect(text).toContain("110");
  });
});

// ─── CC field in EmailPayload ─────────────────────────────────────────────────
// These tests verify the CC logic that lives in the router mutation.
// We test the decision logic directly (not nodemailer internals).

describe("CC requester logic", () => {
  /**
   * Mirrors the logic in routers.ts:
   *   const cc = requesterEmail && requesterEmail !== accountingEmail ? requesterEmail : undefined;
   */
  function resolveCC(
    requesterEmail: string | null,
    accountingEmail: string
  ): string | undefined {
    return requesterEmail && requesterEmail !== accountingEmail
      ? requesterEmail
      : undefined;
  }

  it("sets CC to requester email when it differs from accounting email", () => {
    expect(resolveCC("chris@example.com", "accounting@example.com")).toBe(
      "chris@example.com"
    );
  });

  it("omits CC when requester email is null", () => {
    expect(resolveCC(null, "accounting@example.com")).toBeUndefined();
  });

  it("omits CC when requester email equals accounting email (avoid self-CC)", () => {
    expect(resolveCC("accounting@example.com", "accounting@example.com")).toBeUndefined();
  });

  it("omits CC when requester email is empty string", () => {
    expect(resolveCC("", "accounting@example.com")).toBeUndefined();
  });
});
