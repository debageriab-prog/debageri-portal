import { getIsoWeek } from "@/lib/dates/iso-week";

export type ReportedWeek = { isoYear: number; isoWeek: number; status: string };

export function findMissingWeeks(
  reportingStartDate: string,
  today: string,
  reports: ReportedWeek[],
) {
  const reported = new Set(
    reports
      .filter((report) => ["submitted", "approved"].includes(report.status))
      .map((report) => `${report.isoYear}-${report.isoWeek}`),
  );
  const cursor = new Date(`${reportingStartDate}T12:00:00Z`);
  const weekday = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() - weekday + 1);
  const current = getIsoWeek(today);
  const missing: Array<{ isoYear: number; isoWeek: number }> = [];
  while (cursor.toISOString().slice(0, 10) < today) {
    const week = getIsoWeek(cursor.toISOString().slice(0, 10));
    const key = `${week.isoYear}-${week.isoWeek}`;
    if (
      key !== `${current.isoYear}-${current.isoWeek}` &&
      !reported.has(key) &&
      !missing.some((item) => `${item.isoYear}-${item.isoWeek}` === key)
    )
      missing.push(week);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return missing;
}
