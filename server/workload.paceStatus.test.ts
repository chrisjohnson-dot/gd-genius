import { describe, it, expect } from "vitest";
import { computePaceStatus } from "./routers/workload";

describe("computePaceStatus", () => {
  it("returns green when current rate equals required rate", () => {
    expect(computePaceStatus(100, 100)).toBe("green");
  });

  it("returns green when current rate exceeds required rate", () => {
    expect(computePaceStatus(150, 100)).toBe("green");
  });

  it("returns amber when current rate is 70–99% of required rate", () => {
    expect(computePaceStatus(70, 100)).toBe("amber");
    expect(computePaceStatus(85, 100)).toBe("amber");
    expect(computePaceStatus(99, 100)).toBe("amber");
  });

  it("returns red when current rate is below 70% of required rate", () => {
    expect(computePaceStatus(69, 100)).toBe("red");
    expect(computePaceStatus(0, 100)).toBe("red");
    expect(computePaceStatus(1, 100)).toBe("red");
  });

  it("returns green when required rate is 0 and current rate is positive", () => {
    expect(computePaceStatus(50, 0)).toBe("green");
  });

  it("returns no_data when both rates are 0", () => {
    expect(computePaceStatus(0, 0)).toBe("no_data");
  });

  it("returns no_data when required rate is 0 and current rate is 0", () => {
    expect(computePaceStatus(0, 0)).toBe("no_data");
  });

  it("handles fractional rates correctly", () => {
    // 72.5 / 100 = 72.5% → amber
    expect(computePaceStatus(72.5, 100)).toBe("amber");
    // 69.9 / 100 = 69.9% → red
    expect(computePaceStatus(69.9, 100)).toBe("red");
  });

  it("handles large values correctly", () => {
    expect(computePaceStatus(1000, 800)).toBe("green");
    expect(computePaceStatus(600, 800)).toBe("amber"); // 75%
    expect(computePaceStatus(400, 800)).toBe("red");   // 50%
  });

  it("handles exact 70% boundary as amber", () => {
    expect(computePaceStatus(70, 100)).toBe("amber");
  });

  it("handles exact 100% boundary as green", () => {
    expect(computePaceStatus(100, 100)).toBe("green");
  });
});
