"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";

type HistorySheet = {
  id: string;
  isoYear: number;
  isoWeek: number;
  periodStart: string;
  periodEnd: string;
  reportedMinutes: number;
  expectedMinutes: number;
  status: string;
};
type HistoryEntry = {
  timesheetId: string;
  date: string;
  minutes: number;
  code: string;
  countsAsWorkedTime: boolean;
};
type HistoryTerm = {
  validFrom: string;
  validTo: string | null;
  reportingStartDate: string;
  schedule: Record<string, number>;
};
const scheduleKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function HistoryView({
  sheets,
  entries,
  currentYear,
  currentWeek,
  currentMonth,
  terms,
  holidayDates,
}: {
  sheets: HistorySheet[];
  entries: HistoryEntry[];
  currentYear: number;
  currentWeek: number;
  currentMonth: string;
  terms: HistoryTerm[];
  holidayDates: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [year, setYear] = useState(currentYear);
  const [week, setWeek] = useState(currentWeek);
  const [month, setMonth] = useState(currentMonth);
  const [deleting, setDeleting] = useState<HistorySheet | null>(null);
  const [error, setError] = useState("");

  const weeklySheets = sheets.filter(
    (sheet) => sheet.isoYear === year && sheet.isoWeek === week,
  );
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const monthSheets = sheets.filter((sheet) =>
    sheet.periodStart.startsWith(month),
  );
  const monthTotals = useMemo(() => {
    const byCode = new Map<string, number>();
    let worked = 0;
    for (const entry of monthEntries) {
      if (entry.countsAsWorkedTime) worked += entry.minutes;
      else
        byCode.set(entry.code, (byCode.get(entry.code) ?? 0) + entry.minutes);
    }
    const [monthYear, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(
      Date.UTC(monthYear!, monthNumber!, 0),
    ).getUTCDate();
    let expected = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6 || holidayDates.includes(date))
        continue;
      const term = terms
        .filter(
          (item) =>
            item.validFrom <= date &&
            item.reportingStartDate <= date &&
            (!item.validTo || item.validTo >= date),
        )
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
      if (term) expected += Number(term.schedule[scheduleKeys[weekday]!] ?? 0);
    }
    const reported = monthEntries.reduce(
      (sum, entry) => sum + entry.minutes,
      0,
    );
    return {
      worked,
      unreported: Math.max(0, expected - reported),
      byCode,
      total: Math.max(expected, reported, 1),
    };
  }, [holidayDates, month, monthEntries, terms]);

  const segments = [
    { label: "Worked", value: monthTotals.worked, color: "#35634a" },
    {
      label: "Not reported",
      value: monthTotals.unreported,
      color: "#ddd3ca",
    },
    ...[...monthTotals.byCode].map(([label, value], index) => ({
      label,
      value,
      color: ["#a56f4e", "#b88b5d", "#8a7186", "#668a91"][index % 4]!,
    })),
  ].filter((segment) => segment.value > 0);
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = (cursor / monthTotals.total) * 360;
      cursor += segment.value;
      const end = (cursor / monthTotals.total) * 360;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  async function remove() {
    if (!deleting) return;
    const response = await fetch(
      `/api/timesheets/${encodeURIComponent(deleting.id)}`,
      { method: "DELETE" },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return setError(result.error ?? "Could not delete draft.");
    setDeleting(null);
    router.refresh();
  }

  function table(selected: HistorySheet[]) {
    return selected.length ? (
      <table>
        <thead>
          <tr>
            <th>Week</th>
            <th>Period</th>
            <th>Reported</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {selected.map((sheet) => (
            <tr key={sheet.id}>
              <td>
                {sheet.isoYear}-W{String(sheet.isoWeek).padStart(2, "0")}
              </td>
              <td>
                {sheet.periodStart} to {sheet.periodEnd}
              </td>
              <td>{formatDuration(sheet.reportedMinutes)}</td>
              <td>
                <span className="status">{sheet.status}</span>
              </td>
              <td>
                {sheet.status === "draft" && (
                  <div className="row-actions">
                    <Link
                      className="table-action"
                      href={`/employee/timesheets/current?year=${sheet.isoYear}&week=${sheet.isoWeek}`}
                    >
                      Edit
                    </Link>
                    <button
                      className="table-action table-action-danger"
                      onClick={() => {
                        setError("");
                        setDeleting(sheet);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p>No timesheets for this selection.</p>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time reporting</div>
          <h1>History</h1>
          <p className="muted page-description">
            Review weekly reports or explore a monthly breakdown of work,
            missing time and other time codes.
          </p>
        </div>
      </div>
      <section className="card history-controls">
        <div className="week-mode-picker">
          <button
            className={mode === "week" ? "selected" : ""}
            onClick={() => setMode("week")}
          >
            Week
          </button>
          <button
            className={mode === "month" ? "selected" : ""}
            onClick={() => setMode("month")}
          >
            Month
          </button>
        </div>
        {mode === "week" ? (
          <div className="actions">
            <label>
              Year
              <input
                className="field compact-field"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            <label>
              Week
              <input
                className="field compact-field"
                type="number"
                min="1"
                max="53"
                value={week}
                onChange={(event) => setWeek(Number(event.target.value))}
              />
            </label>
          </div>
        ) : (
          <label>
            Month
            <input
              className="field"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        )}
      </section>
      {mode === "month" && (
        <section className="card month-summary">
          <div
            className="donut"
            style={{
              background: gradient ? `conic-gradient(${gradient})` : "#eee",
            }}
          >
            <div>
              <strong>
                {formatDuration(
                  monthEntries.reduce((sum, entry) => sum + entry.minutes, 0),
                )}
              </strong>
              <span>reported</span>
            </div>
          </div>
          <div className="chart-legend">
            {segments.map((segment) => (
              <div key={segment.label}>
                <i style={{ background: segment.color }} />
                <span>{segment.label}</span>
                <strong>{formatDuration(segment.value)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card table-wrap">
        {table(mode === "week" ? weeklySheets : monthSheets)}
      </section>
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">Delete draft</span>
                <h2>Delete week {deleting.isoWeek}?</h2>
                <p>
                  The draft and its saved entries will be permanently removed.
                </p>
              </div>
            </header>
            {error && <p className="notice notice-error">{error}</p>}
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                Keep draft
              </button>
              <button className="button danger" onClick={() => void remove()}>
                Delete draft
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
