import { describe, expect, it } from "vitest";
import type { EmploymentTerm, TimeCode, TimeEntry } from "@/domain/types";
import {
  assertNoEmploymentOverlap,
  assertTransition,
  calculateTotals,
  canReview,
  selectEmploymentTerm,
  validateEntry,
} from "@/domain/timesheets/rules";

const term = (id: string, from: string, to: string | null): EmploymentTerm => ({
  id,
  organizationId: "debageri",
  userId: "u1",
  validFrom: from,
  validTo: to,
  employmentPercentage: 100,
  weeklyMinutes: 2400,
  schedule: {
    monday: 480,
    tuesday: 480,
    wednesday: 480,
    thursday: 480,
    friday: 480,
    saturday: 0,
    sunday: 0,
  },
});
const code: TimeCode = {
  id: "REG",
  organizationId: "debageri",
  code: "REG",
  name: { sv: "Ordinarie", en: "Regular" },
  category: "work",
  requiresComment: false,
  countsAsWorkedTime: true,
  countsTowardExpectedTime: true,
  employeeCanSelect: true,
  active: true,
  validFrom: "2026-01-01",
  validTo: null,
  sortOrder: 1,
};
const entry = (
  id: string,
  minutes: number,
  override: Partial<TimeEntry> = {},
): TimeEntry => ({
  id,
  organizationId: "debageri",
  timesheetId: "sheet",
  userId: "u1",
  date: "2026-07-29",
  isoYear: 2026,
  isoWeek: 31,
  year: 2026,
  month: 7,
  timeCodeId: "REG",
  timeCodeSnapshot: {
    code: "REG",
    name: "Ordinarie",
    category: "work",
    countsAsWorkedTime: true,
    countsTowardExpectedTime: true,
  },
  minutes,
  comment: null,
  projectId: null,
  ...override,
});

describe("timesheet rules", () => {
  it("allows only supported transitions", () => {
    expect(() => assertTransition("draft", "submitted")).not.toThrow();
    expect(() => assertTransition("draft", "approved")).toThrow();
    expect(() => assertTransition("rejected", "submitted")).not.toThrow();
  });
  it("selects date-versioned terms and rejects overlap", () => {
    const terms = [
      term("old", "2026-01-01", "2026-06-30"),
      term("new", "2026-07-01", null),
    ];
    expect(selectEmploymentTerm(terms, "2026-07-29")?.id).toBe("new");
    expect(() =>
      assertNoEmploymentOverlap(
        terms,
        term("overlap", "2026-06-01", "2026-08-01"),
      ),
    ).toThrow();
  });
  it("recalculates totals including multiple codes on a date", () => {
    const parental = entry("2", 120, {
      timeCodeId: "PARENTAL",
      timeCodeSnapshot: {
        code: "PARENTAL",
        name: "Föräldraledighet",
        category: "parental_leave",
        countsAsWorkedTime: false,
        countsTowardExpectedTime: true,
      },
    });
    expect(calculateTotals([entry("1", 360), parental], 480)).toEqual({
      expectedMinutes: 480,
      reportedMinutes: 480,
      workedMinutes: 360,
      absenceMinutes: 120,
    });
  });
  it("validates active periods and comments", () => {
    expect(() => validateEntry(entry("1", 480), code)).not.toThrow();
    expect(() =>
      validateEntry(entry("1", 480), { ...code, active: false }),
    ).toThrow();
    expect(() =>
      validateEntry(entry("1", 480), { ...code, requiresComment: true }),
    ).toThrow();
  });
  it("enforces manager assignment and organization isolation", () => {
    expect(
      canReview(
        { id: "m1", role: "manager", organizationId: "debageri" },
        {
          role: "consultant",
          reportsTime: true,
          organizationId: "debageri",
        },
      ),
    ).toBe(true);
    expect(
      canReview(
        { id: "accountant", role: "accountant", organizationId: "debageri" },
        {
          role: "consultant",
          reportsTime: true,
          organizationId: "debageri",
        },
      ),
    ).toBe(false);
    expect(
      canReview(
        { id: "admin", role: "admin", organizationId: "other" },
        {
          role: "consultant",
          reportsTime: true,
          organizationId: "debageri",
        },
      ),
    ).toBe(false);
    expect(
      canReview(
        { id: "admin", role: "admin", organizationId: "debageri" },
        {
          role: "manager",
          reportsTime: true,
          organizationId: "debageri",
        },
      ),
    ).toBe(true);
  });
});
