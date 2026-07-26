"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";

type HistorySheet = {
  id: string;
  isoYear: number;
  isoWeek: number;
  part: number;
  partCount: number;
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
  const [mode, setMode] = useState<"latest" | "month" | "week">("latest");
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(currentYear);
  const [week, setWeek] = useState(currentWeek);
  const [month, setMonth] = useState(currentMonth);
  const [deleting, setDeleting] = useState<HistorySheet | null>(null);
  const [error, setError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const weeklySheets = sheets.filter(
    (sheet) => sheet.isoYear === year && sheet.isoWeek === week,
  );
  const latestSheets = sheets.slice((page - 1) * 10, page * 10);
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
  const weeklyEntries = entries.filter((entry) =>
    weeklySheets.some((sheet) => sheet.id === entry.timesheetId),
  );
  const chartTotals =
    mode === "week"
      ? {
          worked: weeklyEntries
            .filter((entry) => entry.countsAsWorkedTime)
            .reduce((sum, entry) => sum + entry.minutes, 0),
          unreported: Math.max(
            0,
            weeklySheets.reduce(
              (sum, sheet) => sum + sheet.expectedMinutes,
              0,
            ) - weeklyEntries.reduce((sum, entry) => sum + entry.minutes, 0),
          ),
          byCode: weeklyEntries
            .filter((entry) => !entry.countsAsWorkedTime)
            .reduce((totals, entry) => {
              totals.set(
                entry.code,
                (totals.get(entry.code) ?? 0) + entry.minutes,
              );
              return totals;
            }, new Map<string, number>()),
          total: Math.max(
            weeklySheets.reduce((sum, sheet) => sum + sheet.expectedMinutes, 0),
            weeklyEntries.reduce((sum, entry) => sum + entry.minutes, 0),
            1,
          ),
        }
      : monthTotals;

  const segments = [
    { label: "Worked", value: chartTotals.worked, color: "#35634a" },
    {
      label: "Not reported",
      value: chartTotals.unreported,
      color: "#ddd3ca",
    },
    ...[...chartTotals.byCode].map(([label, value], index) => ({
      label,
      value,
      color: ["#a56f4e", "#b88b5d", "#8a7186", "#668a91"][index % 4]!,
    })),
  ].filter((segment) => segment.value > 0);
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = (cursor / chartTotals.total) * 360;
      cursor += segment.value;
      const end = (cursor / chartTotals.total) * 360;
      return `${segment.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  async function remove() {
    if (!deleting) return;
    const response = await fetch(
      `/api/timesheets/${encodeURIComponent(deleting.id)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return setError(result.error ?? "Could not delete the time report.");
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
                {sheet.partCount > 1
                  ? `-${String(sheet.part).padStart(2, "0")}`
                  : ""}
              </td>
              <td>
                {sheet.periodStart} to {sheet.periodEnd}
              </td>
              <td>{formatDuration(sheet.reportedMinutes)}</td>
              <td>
                <span className={`status status-${sheet.status}`}>
                  {sheet.status}
                </span>
              </td>
              <td>
                {["draft", "submitted"].includes(sheet.status) && (
                  <div className="row-actions">
                    {sheet.status === "draft" && (
                      <Link
                        className="table-action"
                        href={`/employee/timesheets/current?year=${sheet.isoYear}&week=${sheet.isoWeek}&part=${sheet.part}`}
                      >
                        Edit
                      </Link>
                    )}
                    <button
                      className="table-action table-action-danger"
                      onClick={() => {
                        setError("");
                        setDeleteConfirmation("");
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
        <div className="week-mode-picker history-mode-picker">
          <button
            className={mode === "latest" ? "selected" : ""}
            onClick={() => setMode("latest")}
          >
            Latest
          </button>
          <button
            className={mode === "month" ? "selected" : ""}
            onClick={() => setMode("month")}
          >
            Month
          </button>
          <button
            className={mode === "week" ? "selected" : ""}
            onClick={() => setMode("week")}
          >
            Week
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
        ) : mode === "month" ? (
          <label>
            Month
            <input
              className="field"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : null}
      </section>
      {mode !== "latest" && (
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
                  (mode === "month" ? monthEntries : weeklyEntries).reduce(
                    (sum, entry) => sum + entry.minutes,
                    0,
                  ),
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
        {table(
          mode === "latest"
            ? latestSheets
            : mode === "week"
              ? weeklySheets
              : monthSheets,
        )}
        {mode === "latest" && sheets.length > 10 && (
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(sheets.length / 10)}
            </span>
            <button
              className="button secondary"
              disabled={page * 10 >= sheets.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        )}
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
                <span className="eyebrow danger-text">Delete time report</span>
                <h2>Delete week {deleting.isoWeek}?</h2>
                <p>
                  This {deleting.status} report and its entries will be
                  permanently removed.
                </p>
              </div>
            </header>
            {error && <p className="notice notice-error">{error}</p>}
            <label>
              Type <strong>I am sure</strong> to confirm
              <input
                className="field"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                Keep report
              </button>
              <button
                className="button danger"
                disabled={deleteConfirmation !== "I am sure"}
                onClick={() => void remove()}
              >
                Delete report
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
