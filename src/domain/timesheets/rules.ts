import type {
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
  subject: {
    role: UserRole;
    reportsTime: boolean;
    organizationId: string;
  },
): boolean {
  if (actor.organizationId !== subject.organizationId) return false;
  const consultant = ["employee", "consultant"].includes(subject.role);
  if (actor.role === "manager") return consultant;
  return (
    actor.role === "admin" &&
    (consultant || (subject.role === "manager" && subject.reportsTime))
  );
}
