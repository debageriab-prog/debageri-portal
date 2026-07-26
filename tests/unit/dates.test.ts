import { describe, expect, it } from "vitest";
import { getIsoWeek, getIsoWeekDates, timesheetId } from "@/lib/dates/iso-week";

describe("ISO weeks", () => {
  it("handles the week-year boundary", () => {
    expect(getIsoWeek("2021-01-01")).toEqual({ isoYear: 2020, isoWeek: 53 });
    expect(getIsoWeek("2026-12-31")).toEqual({ isoYear: 2026, isoWeek: 53 });
  });
  it("returns Monday through Sunday", () => {
    expect(getIsoWeekDates(2026, 31)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
  it("creates deterministic IDs", () => {
    expect(timesheetId("debageri", "abc123", 2026, 3)).toBe(
      "debageri_abc123_2026-W03",
    );
  });
});
