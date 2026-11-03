import { describe, expect, it } from "vitest";
import { isMonth, shiftMonth, stockholmMonthStart } from "@/lib/dates/month";

describe("months", () => {
  it("steps across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("accepts only YYYY-MM", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });

  it("starts at Stockholm midnight in winter and summer", () => {
    expect(stockholmMonthStart("2026-11").toISOString()).toBe(
      "2026-10-31T23:00:00.000Z",
    );
    expect(stockholmMonthStart("2026-07").toISOString()).toBe(
      "2026-06-30T22:00:00.000Z",
    );
  });
});
