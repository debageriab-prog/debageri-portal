import { describe, expect, it } from "vitest";
import type { TimeEntry } from "@/domain/types";
import {
  aggregateReport,
  aggregateReportedBreakdown,
  aggregateReportedDays,
  aggregateReportedMinutes,
  combineReportedTotals,
} from "@/domain/reports/aggregate";

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
  it("counts at most one reported day per calendar date", () => {
    const result = aggregateReportedDays(
      [
        {
          date: "2026-07-27",
          minutes: 16 * 60,
          name: "Regular",
          countsAsWorkedTime: true,
        },
      ],
      2 * 8 * 60,
    );

    expect(result.reported).toBe(8 * 60);
    expect(result.worked).toBe(8 * 60);
    expect(result.unreported).toBe(8 * 60);
  });

  it("sums reported minutes against the expected time", () => {
    const result = aggregateReportedMinutes(
      [
        { minutes: 300, name: "Regular", countsAsWorkedTime: true },
        { minutes: 120, name: "Vacation", countsAsWorkedTime: false },
      ],
      480,
    );

    expect(result.reported).toBe(420);
    expect(result.worked).toBe(300);
    expect(result.byCode.get("Vacation")).toBe(120);
    expect(result.unreported).toBe(60);
    expect(result.total).toBe(480);
  });

  it("keeps each person's daily cap when combining totals", () => {
    const date = "2026-07-27";
    const result = combineReportedTotals([
      aggregateReportedDays(
        [{ date, minutes: 480, name: "Regular", countsAsWorkedTime: true }],
        480,
      ),
      aggregateReportedDays(
        [{ date, minutes: 480, name: "Vacation", countsAsWorkedTime: false }],
        480,
      ),
    ]);

    expect(result.reported).toBe(960);
    expect(result.worked).toBe(480);
    expect(result.byCode.get("Vacation")).toBe(480);
    expect(result.unreported).toBe(0);
  });

  it("does not let one person's extra time hide another's missing time", () => {
    const result = combineReportedTotals([
      aggregateReportedMinutes(
        [{ minutes: 600, name: "Regular", countsAsWorkedTime: true }],
        480,
      ),
      aggregateReportedMinutes([], 480),
    ]);

    expect(result.reported).toBe(600);
    expect(result.unreported).toBe(480);
    expect(result.total).toBe(1080);
  });

  it("merges absence codes across people", () => {
    const vacation = (minutes: number) =>
      aggregateReportedMinutes(
        [{ minutes, name: "Vacation", countsAsWorkedTime: false }],
        minutes,
      );

    expect(
      combineReportedTotals([vacation(60), vacation(120)]).byCode.get(
        "Vacation",
      ),
    ).toBe(180);
  });

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

  it("groups worked time together and keeps absence codes separate", () => {
    expect(
      aggregateReportedBreakdown(
        [
          {
            minutes: 8 * 60,
            timeCodeSnapshot: {
              name: "Regular",
              countsAsWorkedTime: true,
            },
          },
          {
            minutes: 16 * 60,
            timeCodeSnapshot: {
              name: "Project work",
              countsAsWorkedTime: true,
            },
          },
          {
            minutes: 8 * 60,
            timeCodeSnapshot: {
              name: "Vacation",
              countsAsWorkedTime: false,
            },
          },
          {
            minutes: 8 * 60,
            timeCodeSnapshot: {
              name: "Parental leave",
              countsAsWorkedTime: false,
            },
          },
        ],
        "Worked",
      ),
    ).toEqual([
      { label: "Worked", minutes: 24 * 60 },
      { label: "Parental leave", minutes: 8 * 60 },
      { label: "Vacation", minutes: 8 * 60 },
    ]);
  });
});
