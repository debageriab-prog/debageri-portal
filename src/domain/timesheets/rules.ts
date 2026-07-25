import type {
  EmploymentTerm,
  TimeCode,
  TimeEntry,
  TimesheetStatus,
  TimesheetTotals,
  UserRole,
} from "@/domain/types";
import { getIsoWeek } from "@/lib/dates/iso-week";

const transitions: Record<TimesheetStatus, readonly TimesheetStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  approved: ["reopened"],
  rejected: ["submitted"],
  reopened: ["submitted"],
};

export function canTransition(
  from: TimesheetStatus,
  to: TimesheetStatus,
): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(
  from: TimesheetStatus,
  to: TimesheetStatus,
): void {
  if (!canTransition(from, to))
    throw new Error(`Unsupported transition: ${from} -> ${to}`);
}

export function isEditable(status: TimesheetStatus): boolean {
  return status === "draft" || status === "rejected" || status === "reopened";
}

export function selectEmploymentTerm(
  terms: EmploymentTerm[],
  date: string,
): EmploymentTerm | null {
  return (
    terms
      .filter(
        (term) =>
          term.validFrom <= date &&
          (term.validTo === null || term.validTo >= date),
      )
      .sort((left, right) =>
        right.validFrom.localeCompare(left.validFrom),
      )[0] ?? null
  );
}

export function assertNoEmploymentOverlap(
  terms: EmploymentTerm[],
  candidate: EmploymentTerm,
): void {
  const overlaps = terms.some(
    (term) =>
      term.id !== candidate.id &&
      term.userId === candidate.userId &&
      term.organizationId === candidate.organizationId &&
      candidate.validFrom <= (term.validTo ?? "9999-12-31") &&
      (candidate.validTo ?? "9999-12-31") >= term.validFrom,
  );
  if (overlaps) throw new Error("Employment terms overlap");
}

export function validateEntry(entry: TimeEntry, code: TimeCode): void {
  if (!Number.isInteger(entry.minutes) || entry.minutes <= 0)
    throw new Error("Minutes must be positive integers");
  if (
    !code.active ||
    code.validFrom > entry.date ||
    (code.validTo !== null && code.validTo < entry.date)
  ) {
    throw new Error("Time code is not active for this date");
  }
  if (code.requiresComment && !entry.comment?.trim())
    throw new Error("A comment is required");
  const week = getIsoWeek(entry.date);
  if (week.isoYear !== entry.isoYear || week.isoWeek !== entry.isoWeek)
    throw new Error("Entry week is inconsistent");
  if (entry.timeCodeSnapshot.code !== code.code)
    throw new Error("Time code snapshot is immutable");
}

export function calculateTotals(
  entries: TimeEntry[],
  expectedMinutes: number,
): TimesheetTotals {
  return entries.reduce<TimesheetTotals>(
    (totals, entry) => ({
      expectedMinutes,
      reportedMinutes: totals.reportedMinutes + entry.minutes,
      workedMinutes:
        totals.workedMinutes +
        (entry.timeCodeSnapshot.countsAsWorkedTime ? entry.minutes : 0),
      absenceMinutes:
        totals.absenceMinutes +
        (entry.timeCodeSnapshot.countsAsWorkedTime ? 0 : entry.minutes),
    }),
    {
      expectedMinutes,
      reportedMinutes: 0,
      workedMinutes: 0,
      absenceMinutes: 0,
    },
  );
}

export function canReview(
  actor: { id: string; role: UserRole; organizationId: string },
  subject: { managerId: string | null; organizationId: string },
): boolean {
  if (actor.organizationId !== subject.organizationId) return false;
  return (
    actor.role === "admin" ||
    (actor.role === "manager" && subject.managerId === actor.id)
  );
}
