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

export function aggregateReportedBreakdown(
  entries: Array<{
    minutes?: number;
    timeCodeId?: string;
    timeCodeSnapshot?: {
      code?: string;
      name?: string;
      countsAsWorkedTime?: boolean;
    };
  }>,
  workedLabel: string,
) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const snapshot = entry.timeCodeSnapshot;
    const label = snapshot?.countsAsWorkedTime
      ? workedLabel
      : String(snapshot?.name ?? snapshot?.code ?? entry.timeCodeId);
    totals.set(label, (totals.get(label) ?? 0) + Number(entry.minutes ?? 0));
  }
  return [...totals]
    .map(([label, minutes]) => ({ label, minutes }))
    .sort((left, right) =>
      left.label === workedLabel
        ? -1
        : right.label === workedLabel
          ? 1
          : left.label.localeCompare(right.label),
    );
}
