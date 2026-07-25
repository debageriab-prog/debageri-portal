import { describe, expect, it } from "vitest";
import type { TimeEntry } from "@/domain/types";
import { aggregateReport } from "@/domain/reports/aggregate";

const base: TimeEntry = {
  id: "1",
  organizationId: "debageri",
  timesheetId: "s",
  userId: "u",
  date: "2026-07-27",
  isoYear: 2026,
  isoWeek: 31,
  year: 2026,
  month: 7,
  timeCodeId: "REG",
  timeCodeSnapshot: {
    code: "REG",
    name: "Regular",
    category: "work",
    countsAsWorkedTime: true,
    countsTowardExpectedTime: true,
  },
  minutes: 360,
  comment: null,
  projectId: null,
};
describe("reports", () => {
  it("aggregates code, category and day", () => {
    const result = aggregateReport([
      base,
      {
        ...base,
        id: "2",
        timeCodeId: "VAC",
        timeCodeSnapshot: {
          ...base.timeCodeSnapshot,
          code: "VAC",
          category: "vacation",
          countsAsWorkedTime: false,
        },
        minutes: 120,
      },
    ]);
    expect(result.reportedMinutes).toBe(480);
    expect(result.workedMinutes).toBe(360);
    expect(result.byCode).toEqual({ REG: 360, VAC: 120 });
  });
});
