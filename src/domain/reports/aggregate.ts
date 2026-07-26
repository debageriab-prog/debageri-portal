import type { TimeEntry } from "@/domain/types";

export interface ReportSummary {
  reportedMinutes: number;
  workedMinutes: number;
  absenceMinutes: number;
  byCode: Record<string, number>;
  byCategory: Record<string, number>;
  byDate: Record<string, number>;
}

export function aggregateReport(entries: TimeEntry[]): ReportSummary {
  return entries.reduce<ReportSummary>(
    (summary, entry) => {
      summary.reportedMinutes += entry.minutes;
      if (entry.timeCodeSnapshot.countsAsWorkedTime)
        summary.workedMinutes += entry.minutes;
      else summary.absenceMinutes += entry.minutes;
      summary.byCode[entry.timeCodeSnapshot.code] =
        (summary.byCode[entry.timeCodeSnapshot.code] ?? 0) + entry.minutes;
      summary.byCategory[entry.timeCodeSnapshot.category] =
        (summary.byCategory[entry.timeCodeSnapshot.category] ?? 0) +
        entry.minutes;
      summary.byDate[entry.date] =
        (summary.byDate[entry.date] ?? 0) + entry.minutes;
      return summary;
    },
    {
      reportedMinutes: 0,
      workedMinutes: 0,
      absenceMinutes: 0,
      byCode: {},
      byCategory: {},
      byDate: {},
    },
  );
}
