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

export function aggregateReportedDays(
  entries: Array<{
    date: string;
    minutes: number;
    name: string;
    countsAsWorkedTime: boolean;
  }>,
  expectedMinutes: number,
) {
  const entriesByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const dateEntries = entriesByDate.get(entry.date) ?? [];
    dateEntries.push(entry);
    entriesByDate.set(entry.date, dateEntries);
  }

  let worked = 0;
  let reported = 0;
  const byCode = new Map<string, number>();
  for (const dateEntries of entriesByDate.values()) {
    const dateMinutes = dateEntries.reduce(
      (total, entry) => total + entry.minutes,
      0,
    );
    const cappedMinutes = Math.min(480, dateMinutes);
    const scale = dateMinutes > 0 ? cappedMinutes / dateMinutes : 0;
    reported += cappedMinutes;
    for (const entry of dateEntries) {
      const contribution = entry.minutes * scale;
      if (entry.countsAsWorkedTime) worked += contribution;
      else byCode.set(entry.name, (byCode.get(entry.name) ?? 0) + contribution);
    }
  }

  return {
    worked,
    unreported: Math.max(0, expectedMinutes - reported),
    byCode,
    total: Math.max(expectedMinutes, reported, 1),
    reported,
  };
}
