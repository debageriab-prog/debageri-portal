"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";
import { appCheckFetch } from "@/lib/firebase/client";

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
  name: string;
  countsAsWorkedTime: boolean;
};
export function HistoryView({
  sheets,
  entries,
  currentYear,
  currentWeek,
  currentMonth,
  reportingStartDate,
  employmentEndDate,
  holidayDates,
  readOnly = false,
  title = "History",
  description = "Review weekly reports or explore a monthly breakdown of work, missing time and other time codes.",
}: {
  sheets: HistorySheet[];
  entries: HistoryEntry[];
  currentYear: number;
  currentWeek: number;
  currentMonth: string;
  reportingStartDate: string | null;
  employmentEndDate: string | null;
  holidayDates: string[];
  readOnly?: boolean;
  title?: string;
  description?: string;
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
  const [viewing, setViewing] = useState<HistorySheet | null>(null);

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
        byCode.set(entry.name, (byCode.get(entry.name) ?? 0) + entry.minutes);
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
      if (
        (!reportingStartDate || date >= reportingStartDate) &&
        (!employmentEndDate || date <= employmentEndDate)
      )
        expected += 480;
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
  }, [
    employmentEndDate,
    holidayDates,
    month,
    monthEntries,
    reportingStartDate,
  ]);
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
                entry.name,
                (totals.get(entry.name) ?? 0) + entry.minutes,
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

  function reportBreakdown(timesheetId: string) {
    const totals = new Map<string, number>();
    for (const entry of entries.filter(
      (item) => item.timesheetId === timesheetId,
    )) {
      const label = entry.countsAsWorkedTime ? "Worked" : entry.name;
      totals.set(label, (totals.get(label) ?? 0) + entry.minutes);
    }
    if (!totals.size) totals.set("Worked", 0);
    return [...totals].sort(([left], [right]) =>
      left === "Worked"
        ? -1
        : right === "Worked"
          ? 1
          : left.localeCompare(right),
    );
  }

  async function remove() {
    if (!deleting) return;
    const response = await appCheckFetch(
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
              <td>
                <div className="report-breakdown">
                  {reportBreakdown(sheet.id).map(([label, minutes]) => (
                    <span key={label}>
                      <strong>{formatDuration(minutes)}</strong> {label}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <span className={`status status-${sheet.status}`}>
                  {sheet.status}
                </span>
              </td>
              <td>
                {readOnly ? (
                  <button
                    className="table-action"
                    onClick={() => setViewing(sheet)}
                  >
                    View
                  </button>
                ) : (
                  ["draft", "submitted"].includes(sheet.status) && (
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
                  )
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
          <h1>{title}</h1>
          <p className="muted page-description">{description}</p>
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
      {viewing && (
        <div className="modal-backdrop" onMouseDown={() => setViewing(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Time report for week ${viewing.isoWeek}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">Time report details</span>
                <h2>
                  Week {viewing.isoWeek}
                  {viewing.partCount > 1
                    ? `-${String(viewing.part).padStart(2, "0")}`
                    : ""}
                </h2>
                <p>
                  {viewing.periodStart} to {viewing.periodEnd}
                </p>
              </div>
              <button
                className="modal-close"
                aria-label="Close time report details"
                onClick={() => setViewing(null)}
              >
                ×
              </button>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time code</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .filter((entry) => entry.timesheetId === viewing.id)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((entry, index) => (
                      <tr key={`${entry.date}-${entry.name}-${index}`}>
                        <td>{entry.date}</td>
                        <td>
                          {entry.countsAsWorkedTime ? "Worked" : entry.name}
                        </td>
                        <td>{formatDuration(entry.minutes)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setViewing(null)}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
