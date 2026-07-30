import { describe, expect, it } from "vitest";
import { findMissingWeeks } from "@/domain/reminders/missing-weeks";

describe("time report reminders", () => {
  it("omits submitted and approved weeks and excludes the current week", () => {
    expect(
      findMissingWeeks("2026-07-06", "2026-07-29", [
        { isoYear: 2026, isoWeek: 28, status: "approved" },
        { isoYear: 2026, isoWeek: 29, status: "submitted" },
        { isoYear: 2026, isoWeek: 30, status: "draft" },
      ]),
    ).toEqual([{ isoYear: 2026, isoWeek: 30 }]);
  });
});
