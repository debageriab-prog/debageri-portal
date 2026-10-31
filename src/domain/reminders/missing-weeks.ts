import { isAfterEmployment } from "@/domain/timesheets/rules";
import {
  getIsoWeek,
  getIsoWeekDates,
  splitWeekByMonth,
} from "@/lib/dates/iso-week";

export type ReportedWeek = {
  isoYear: number;
  isoWeek: number;
  status: string;
  part?: number;
  partCount?: number;
};

export type MissingWeek = { isoYear: number; isoWeek: number };

export function toReportedWeek(data: Record<string, unknown>): ReportedWeek {
  return {
    isoYear: Number(data.isoYear),
    isoWeek: Number(data.isoWeek),
    status: String(data.status),
    part: Number(data.part ?? 1),
    partCount: Number(data.partCount ?? 1),
  };
}

export function formatMissingWeek(week: MissingWeek) {
  return `${week.isoYear}-W${String(week.isoWeek).padStart(2, "0")}`;
}

/** Only current consultants get reminders; legacy `employee` means consultant. */
export function receivesReminders(user: Record<string, unknown>) {
  return (
    ["employee", "consultant"].includes(String(user.role)) &&
    user.status !== "inactive"
  );
}

/** A consultant whose employment has ended stays listed only while weeks are missing. */
export function listedInReminderOverview(
  employmentEndDate: string | null | undefined,
  today: string,
  missing: MissingWeek[],
) {
  return missing.length > 0 || !isAfterEmployment(today, employmentEndDate);
}

/**
 * Lists the weeks the consultant still has to report. A week that spans two
 * months has one timesheet per month, so every part that falls inside the
 * employment and has started must be submitted. The current week is left out
 * unless `includeCurrentWeek` is set, which the end-of-period reminders use,
 * or the employment has already ended, so that week can no longer be in
 * progress.
 */
export function findMissingWeeks(
  reportingStartDate: string,
  today: string,
  reports: ReportedWeek[],
  options: {
    employmentEndDate?: string | null;
    includeCurrentWeek?: boolean;
  } = {},
) {
  const { employmentEndDate, includeCurrentWeek = false } = options;
  const submitted = reports.filter((report) =>
    ["submitted", "approved"].includes(report.status),
  );
  const employmentEnded = isAfterEmployment(today, employmentEndDate);
  const lastExpectedDate = employmentEnded ? employmentEndDate! : today;
  const cursor = new Date(`${reportingStartDate}T12:00:00Z`);
  const weekday = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() - weekday + 1);
  const current = getIsoWeek(today);
  const missing: MissingWeek[] = [];
  while (cursor.toISOString().slice(0, 10) <= lastExpectedDate) {
    const week = getIsoWeek(cursor.toISOString().slice(0, 10));
    const isCurrent =
      week.isoYear === current.isoYear && week.isoWeek === current.isoWeek;
    const parts = splitWeekByMonth(getIsoWeekDates(week.isoYear, week.isoWeek));
    const unreported = parts.some(
      (dates, index) =>
        dates.at(-1)! >= reportingStartDate &&
        dates[0]! <= lastExpectedDate &&
        !submitted.some(
          (report) =>
            report.isoYear === week.isoYear &&
            report.isoWeek === week.isoWeek &&
            ((report.partCount ?? 1) <= 1 || report.part === index + 1),
        ),
    );
    if ((!isCurrent || includeCurrentWeek || employmentEnded) && unreported)
      missing.push(week);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return missing;
}
