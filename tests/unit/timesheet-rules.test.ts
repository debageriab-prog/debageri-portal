import { describe, expect, it } from "vitest";
import { legacyPermissions } from "@/domain/access/permissions";
import type { TimeCode, TimeEntry, UserRole } from "@/domain/types";
import {
  assertTransition,
  calculateTotals,
  canReview,
  hasSameEntries,
  isAfterEmployment,
  validateEntry,
} from "@/domain/timesheets/rules";

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

const reviewer = (id: string, role: UserRole, organizationId = "debageri") => ({
  id,
  role,
  organizationId,
  permissions: legacyPermissions(role),
});

describe("timesheet rules", () => {
  it("allows only supported transitions", () => {
    expect(() => assertTransition("draft", "submitted")).not.toThrow();
    expect(() => assertTransition("draft", "approved")).toThrow();
    expect(() => assertTransition("rejected", "submitted")).not.toThrow();
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
      canReview(reviewer("m1", "manager"), {
        id: "c1",
        role: "consultant",
        reportsTime: true,
        organizationId: "debageri",
      }),
    ).toBe(true);
    expect(
      canReview(reviewer("accountant", "accountant"), {
        id: "c1",
        role: "consultant",
        reportsTime: true,
        organizationId: "debageri",
      }),
    ).toBe(false);
    expect(
      canReview(reviewer("admin", "admin", "other"), {
        id: "c1",
        role: "consultant",
        reportsTime: true,
        organizationId: "debageri",
      }),
    ).toBe(false);
    expect(
      canReview(reviewer("admin", "admin"), {
        id: "m1",
        role: "manager",
        reportsTime: true,
        organizationId: "debageri",
      }),
    ).toBe(true);
  });
  it("follows the profile but never lets anyone review themselves", () => {
    const consultant = {
      id: "c1",
      role: "consultant" as const,
      reportsTime: true,
      organizationId: "debageri",
    };
    const manager = reviewer("m1", "manager");
    const accountant = reviewer("a1", "accountant");
    expect(canReview({ ...manager, permissions: [] }, consultant)).toBe(false);
    expect(
      canReview(
        { ...accountant, permissions: ["time.approvals.review"] },
        consultant,
      ),
    ).toBe(true);
    expect(
      canReview(manager, { ...consultant, id: "m1", role: "manager" }),
    ).toBe(false);
    expect(
      canReview(
        {
          ...reviewer("c2", "consultant"),
          permissions: ["time.approvals.review"],
        },
        { ...consultant, id: "c2" },
      ),
    ).toBe(false);
  });
});

describe("employment end date", () => {
  it("allows reporting through the last day of employment", () => {
    expect(isAfterEmployment("2026-07-15", "2026-07-15")).toBe(false);
    expect(isAfterEmployment("2026-07-16", "2026-07-15")).toBe(true);
    expect(isAfterEmployment("2026-07-16", null)).toBe(false);
    expect(isAfterEmployment("2026-07-16", undefined)).toBe(false);
  });
});

describe("hasSameEntries", () => {
  const entry = (date: string, minutes: number, timeCodeId = "work") => ({
    date,
    minutes,
    timeCodeId,
  });

  it("ignores order and adds rows for the same date and code", () => {
    expect(
      hasSameEntries(
        [entry("2026-10-26", 480), entry("2026-10-27", 420)],
        [entry("2026-10-27", 420), entry("2026-10-26", 480)],
      ),
    ).toBe(true);
    expect(
      hasSameEntries(
        [entry("2026-10-26", 480)],
        [entry("2026-10-26", 240), entry("2026-10-26", 240)],
      ),
    ).toBe(true);
  });

  it("notices changed hours, codes, dates and removed rows", () => {
    const stored = [entry("2026-10-26", 480)];
    expect(hasSameEntries(stored, [entry("2026-10-26", 420)])).toBe(false);
    expect(hasSameEntries(stored, [entry("2026-10-26", 480, "sick")])).toBe(
      false,
    );
    expect(hasSameEntries(stored, [entry("2026-10-27", 480)])).toBe(false);
    expect(hasSameEntries(stored, [])).toBe(false);
  });
});
