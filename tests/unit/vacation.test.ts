import { describe, expect, it } from "vitest";
import {
  availableForTargets,
  carryOverAdjustments,
  computeVacationBalance,
} from "@/domain/vacation/balance";
import {
  DEFAULT_VACATION_SETTINGS,
  minutesToDays,
  periodAfter,
  periodContaining,
  resetDateInYear,
  VACATION_DAY_MINUTES,
} from "@/domain/vacation/periods";
import {
  earnedDays,
  earnedMinutes,
  employedDays,
} from "@/domain/vacation/renewal";

const day = VACATION_DAY_MINUTES;

describe("vacation periods", () => {
  it("runs from the reset date to the day before the next one", () => {
    expect(periodContaining("2026-11-07", DEFAULT_VACATION_SETTINGS)).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
    });
    expect(periodContaining("2026-03-31", DEFAULT_VACATION_SETTINGS)).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
    });
  });

  it("starts a new period on the reset date itself", () => {
    expect(
      periodContaining("2027-04-01", DEFAULT_VACATION_SETTINGS).start,
    ).toBe("2027-04-01");
  });

  it("moves Feb 29 and Apr 31 to the month's last day", () => {
    const leap = { resetMonth: 2, resetDay: 29 };
    expect(resetDateInYear(2027, leap)).toBe("2027-02-28");
    expect(resetDateInYear(2028, leap)).toBe("2028-02-29");
    expect(resetDateInYear(2026, { resetMonth: 4, resetDay: 31 })).toBe(
      "2026-04-30",
    );
    expect(periodContaining("2027-06-01", leap)).toEqual({
      start: "2027-02-28",
      end: "2028-02-28",
    });
  });

  it("follows on from the previous period", () => {
    expect(
      periodAfter(
        { start: "2026-04-01", end: "2027-03-31" },
        DEFAULT_VACATION_SETTINGS,
      ),
    ).toEqual({ start: "2027-04-01", end: "2028-03-31" });
  });

  it("shows days with one decimal", () => {
    expect(minutesToDays(day * 18 + 240)).toBe(18.5);
  });
});

describe("vacation renewal", () => {
  const period = { start: "2026-04-01", end: "2027-03-31" };

  it("grants the full year after a full period", () => {
    expect(earnedMinutes(30, period, "2020-01-01", null)).toBe(30 * day);
  });

  it("pro-rates 10 of 12 months", () => {
    expect(employedDays(period, "2026-06-01", null)).toBe(304);
    expect(earnedMinutes(30, period, "2026-06-01", null)).toBe(25 * day);
  });

  it("rounds a mid-month start up", () => {
    expect(earnedDays(25, 100, 365)).toBe(7);
    expect(earnedMinutes(25, period, "2026-12-15", null)).toBe(8 * day);
  });

  it("stops counting at the employment end date", () => {
    expect(employedDays(period, null, "2026-04-30")).toBe(30);
    expect(employedDays(period, "2027-05-01", null)).toBe(0);
    expect(earnedDays(30, 0, 365)).toBe(0);
  });
});

describe("vacation balance", () => {
  const base = {
    grantedMinutes: 20 * day,
    normalAdjustMinutes: 3 * day,
    savedAdjustMinutes: 2 * day,
    advanceAdjustMinutes: 5 * day,
    usedMinutes: 0,
  };

  it("uses saved days, then normal days, then advance days", () => {
    expect(
      computeVacationBalance({ ...base, usedMinutes: 6.5 * day }),
    ).toMatchObject({ saved: 0, normal: 18.5 * day, advance: 5 * day });
    expect(
      computeVacationBalance({ ...base, usedMinutes: 27 * day }),
    ).toMatchObject({
      saved: 0,
      normal: 0,
      advance: 3 * day,
      overdrawn: false,
    });
  });

  it("goes negative on normal days when every bucket is used", () => {
    const balance = computeVacationBalance({ ...base, usedMinutes: 32 * day });
    expect(balance).toMatchObject({
      saved: 0,
      normal: -2 * day,
      advance: 0,
      overdrawn: true,
    });
  });

  it("carries leftover days into saved days", () => {
    const closing = computeVacationBalance({ ...base, usedMinutes: 10 * day });
    expect(carryOverAdjustments(closing)).toEqual({
      saved: 15 * day,
      normal: 0,
      advance: 0,
    });
    const overdrawn = computeVacationBalance({
      ...base,
      usedMinutes: 32 * day,
    });
    expect(carryOverAdjustments(overdrawn)).toEqual({
      saved: 0,
      normal: -2 * day,
      advance: -5 * day,
    });
  });
});

describe("vacation balance targets", () => {
  const cases = [
    { saved: 2 * day, normal: 23 * day, advance: 5 * day },
    { saved: 0, normal: 23 * day, advance: 5 * day },
    { saved: 0, normal: 0, advance: 5 * day },
    { saved: 0, normal: 0, advance: 0 },
  ];
  it.each(cases)("lands on the targets after usage: %o", (targets) => {
    for (const usedMinutes of [0, 6.5 * day]) {
      const available = availableForTargets(targets, usedMinutes);
      expect(
        computeVacationBalance({
          grantedMinutes: 0,
          normalAdjustMinutes: available.normal,
          savedAdjustMinutes: available.saved,
          advanceAdjustMinutes: available.advance,
          usedMinutes,
        }),
      ).toMatchObject(targets);
    }
  });
});
