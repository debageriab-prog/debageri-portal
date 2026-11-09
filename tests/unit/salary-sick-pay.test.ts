import { describe, expect, it } from "vitest";
import { buildSalaryLines, type SalaryTimeEntry } from "@/domain/salary/build";
import { sickPeriods } from "@/domain/salary/sick-pay";
import { datesBetween, isWorkingDay } from "@/domain/time/working-days";

const none = new Set<string>();

/** Working days from one date to another, each a full sick day. */
const sick = (from: string, to: string) =>
  datesBetween(from, to)
    .filter((date) => isWorkingDay(date, none))
    .map((date) => ({ date, minutes: 480 }));

/** 41 600 kr a month is 240 kr an hour. */
const september = {
  period: "2026-09",
  agreement: {
    model: "fixed" as const,
    fixedMonthlySalaryMinor: 4_160_000,
    requestedMonthlySalaryMinor: null,
  },
  supplementBps: 80,
  eventFrom: "2026-08-01",
  eventTo: "2026-08-31",
  holidays: none,
};

const entries = (days: { date: string; minutes: number }[]) =>
  days.map((day): SalaryTimeEntry => ({
    ...day,
    category: "sick_leave" as const,
  }));

const sickLines = (input: Parameters<typeof buildSalaryLines>[0]) =>
  buildSalaryLines(input)
    .filter((line) => line.article !== "monthlySalary")
    .map((line) => [
      line.article,
      line.from,
      line.to,
      line.quantityHundredths,
      line.unitPriceMinor,
    ]);

describe("sick pay periods", () => {
  it("counts calendar days, weekends included, and stops sick pay after day 14", () => {
    // Monday 3 August to Friday 21 August: day 19 is the last.
    const [period] = sickPeriods(sick("2026-08-03", "2026-08-21"), none);
    expect(period!.waitingDay).toBe(true);
    const last = period!.days.filter((day) => day.employerPays).at(-1);
    expect(last).toMatchObject({ date: "2026-08-14", dayNumber: 12 });
    expect(period!.days.find((day) => !day.employerPays)).toMatchObject({
      date: "2026-08-17",
      dayNumber: 15,
    });
  });

  it("continues the period when falling ill again within five days", () => {
    const periods = sickPeriods(
      [
        ...sick("2026-08-03", "2026-08-05"), // days 1–3
        ...sick("2026-08-10", "2026-08-11"), // 4 days between
        ...sick("2026-08-24", "2026-08-24"), // 12 days between
      ],
      none,
    );
    expect(periods.map((period) => period.start)).toEqual([
      "2026-08-03",
      "2026-08-24",
    ]);
    expect(periods[0]!.days.map((day) => day.dayNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("makes no waiting-day deduction after ten in twelve months", () => {
    const starts = [
      "2025-10-06",
      "2025-11-03",
      "2025-12-01",
      "2026-01-05",
      "2026-02-02",
      "2026-03-02",
      "2026-04-06",
      "2026-05-04",
      "2026-06-01",
      "2026-07-06",
      "2026-08-03",
    ];
    const periods = sickPeriods(
      starts.map((date) => ({ date, minutes: 480 })),
      none,
    );
    expect(periods.map((period) => period.waitingDay)).toEqual([
      ...Array(10).fill(true),
      false,
    ]);
    // A year after the first, one deduction has dropped out again.
    expect(
      sickPeriods(
        [...starts, "2026-10-12"].map((date) => ({ date, minutes: 480 })),
        none,
      ).at(-1)!.waitingDay,
    ).toBe(true);
  });
});

describe("sick pay lines", () => {
  it("deducts 20 % for days 1–14 and the whole hour from day 15", () => {
    expect(
      sickLines({
        ...september,
        entries: entries(sick("2026-08-03", "2026-08-21")),
      }),
    ).toEqual([
      ["sickLeave", "2026-08-03", "2026-08-14", 8000, -4_800],
      ["sickLeaveFull", "2026-08-17", "2026-08-21", 4000, -24_000],
      // 20 % × 80 % × 240 kr × 40 hours
      ["sickWaitingDay", "2026-08-03", "2026-08-03", 100, -153_600],
    ]);
  });

  it("continues a period from the month before without a new waiting day", () => {
    expect(
      sickLines({
        ...september,
        // Sick from Monday 20 July: 31 July is day 12, so 3 August is day 15.
        earlierSick: sick("2026-07-20", "2026-07-31"),
        entries: entries(sick("2026-08-03", "2026-08-04")),
      }),
    ).toEqual([["sickLeaveFull", "2026-08-03", "2026-08-04", 1600, -24_000]]);
  });

  it("limits the waiting-day deduction to the sick pay of the period", () => {
    // Two hours sick: 80 % × 240 kr × 2 hours = 384 kr.
    expect(
      sickLines({
        ...september,
        entries: entries([{ date: "2026-08-12", minutes: 120 }]),
      }),
    ).toEqual([
      ["sickLeave", "2026-08-12", "2026-08-12", 200, -4_800],
      ["sickWaitingDay", "2026-08-12", "2026-08-12", 100, -38_400],
    ]);
  });
});
