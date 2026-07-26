"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";
import { getIsoWeek } from "@/lib/dates/iso-week";

type Code = { id: string; code: string; category: string };
type StoredEntry = {
  id: string;
  date: string;
  timeCodeId: string;
  minutes: number;
};
type Row = { key: string; timeCodeId: string; minutes: number[] };
type Data = {
  id: string;
  dates: string[];
  redDays: Array<{ date: string; isRed: boolean; reason: string | null }>;
  sheet: {
    isoYear: number;
    isoWeek: number;
    status: string;
    expectedMinutes: number;
    rejectionReason?: string | null;
  };
  codes: Code[];
  entries: StoredEntry[];
  copyEntries: StoredEntry[];
};
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function entriesToRows(data: Data, entries: StoredEntry[]): Row[] {
  const rows = new Map<string, Row>();
  for (const entry of entries) {
    const row = rows.get(entry.timeCodeId) ?? {
      key: entry.timeCodeId,
      timeCodeId: entry.timeCodeId,
      minutes: Array(7).fill(0) as number[],
    };
    const day = data.dates.indexOf(entry.date);
    if (day >= 0) row.minutes[day] = (row.minutes[day] ?? 0) + entry.minutes;
    rows.set(entry.timeCodeId, row);
  }
  const workCode = data.codes.find((code) => code.category === "work");
  if (workCode && !rows.has(workCode.id))
    rows.set(workCode.id, {
      key: workCode.id,
      timeCodeId: workCode.id,
      minutes: Array(7).fill(0) as number[],
    });
  return [...rows.values()].sort(
    (a, b) =>
      data.codes.findIndex((code) => code.id === a.timeCodeId) -
      data.codes.findIndex((code) => code.id === b.timeCodeId),
  );
}

export function WeeklyTimesheet() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [yearInput, setYearInput] = useState(new Date().getUTCFullYear());
  const [weekInput, setWeekInput] = useState(1);
  const [copyMode, setCopyMode] = useState("");
  const [copyYear, setCopyYear] = useState(new Date().getUTCFullYear());
  const [copyWeek, setCopyWeek] = useState(1);
  const [weekMode, setWeekMode] = useState<"current" | "number" | "date">(
    "current",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState("");
  const editable = data && data.sheet.status === "draft";

  async function loadWeek(
    year?: number,
    week?: number,
    copy?: { year: number; week: number },
  ) {
    setMessage("Loading...");
    const query = new URLSearchParams();
    if (year && week) {
      query.set("year", String(year));
      query.set("week", String(week));
    }
    if (copy) {
      query.set("copyYear", String(copy.year));
      query.set("copyWeek", String(copy.week));
    }
    try {
      const response = await fetch(`/api/timesheets/current?${query}`);
      if (response.status === 401) return router.replace("/auth/login");
      const result = await response.json();
      if (!response.ok) return setMessage(result.error);
      const loaded = result.data as Data;
      setData(loaded);
      setYearInput(loaded.sheet.isoYear);
      setWeekInput(loaded.sheet.isoWeek);
      setRows(
        entriesToRows(loaded, copy ? loaded.copyEntries : loaded.entries),
      );
      setMessage(
        copy
          ? "Copied entries are ready. Review, save and submit when finished."
          : "",
      );
    } catch {
      setMessage("The time report could not be loaded.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedYear = Number(params.get("year"));
    const selectedWeek = Number(params.get("week"));
    const timeout = window.setTimeout(() => {
      if (selectedYear && selectedWeek) {
        setWeekMode("number");
        void loadWeek(selectedYear, selectedWeek);
      } else void loadWeek();
    }, 0);
    return () => window.clearTimeout(timeout);
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reported = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total + row.minutes.reduce((sum, minutes) => sum + minutes, 0),
        0,
      ),
    [rows],
  );
  const reportedRedDays =
    data?.redDays.filter(
      (redDay, day) =>
        redDay.isRed && rows.some((row) => (row.minutes[day] ?? 0) > 0),
    ) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const futureDates =
    data?.dates.filter(
      (date, day) =>
        date > today && rows.some((row) => (row.minutes[day] ?? 0) > 0),
    ) ?? [];
  const submitWarnings = [
    ...(reportedRedDays.length
      ? [
          `Time is reported on ${reportedRedDays.length} red ${
            reportedRedDays.length === 1 ? "day" : "days"
          }.`,
        ]
      : []),
    ...(reported > 2400
      ? ["Total reported time exceeds 40 hours for this week."]
      : []),
    ...(futureDates.length
      ? [
          `Time is reported on ${futureDates.length} future ${
            futureDates.length === 1 ? "date" : "dates"
          }.`,
        ]
      : []),
  ];

  function addRow() {
    if (!data?.codes.length) return;
    const unused =
      data.codes.find(
        (code) => !rows.some((row) => row.timeCodeId === code.id),
      ) ?? data.codes[0]!;
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        timeCodeId: unused.id,
        minutes: Array(7).fill(0) as number[],
      },
    ]);
  }

  function changeMinutes(row: Row, day: number, hours: number) {
    if (!data) return;
    const minutes = Math.round(hours * 60);
    const next = [...row.minutes];
    next[day] = minutes;
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, minutes: next } : item,
      ),
    );
  }

  async function save() {
    if (!data) return false;
    setMessage("Saving...");
    try {
      const entries = rows.flatMap((row) =>
        row.minutes.flatMap((minutes, day) =>
          minutes > 0
            ? [
                {
                  date: data.dates[day],
                  timeCodeId: row.timeCodeId,
                  minutes,
                  comment: null,
                },
              ]
            : [],
        ),
      );
      const query = new URLSearchParams({
        year: String(data.sheet.isoYear),
        week: String(data.sheet.isoWeek),
      });
      const response = await fetch(`/api/timesheets/current?${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Saved." : result.error);
      return response.ok;
    } catch {
      setMessage("The time report could not be saved. Please try again.");
      return false;
    }
  }

  async function performSubmit() {
    if (!(await save()) || !data) return;
    const response = await fetch(`/api/timesheets/${data.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return setMessage(
        result.error ??
          "You already reported this week. Delete the draft to report again, or edit the existing draft.",
      );
    setConfirmOpen(false);
    setConfirmation("");
    setRows([]);
    setSuccess("Time reported successfully");
    const nextMonday = new Date(`${data.dates[0]}T12:00:00Z`);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const next = getIsoWeek(nextMonday);
    setWeekMode("number");
    await loadWeek(next.isoYear, next.isoWeek);
  }

  function selectCalendarDate(value: string) {
    if (!value) return;
    const selected = getIsoWeek(value);
    setCopyMode("");
    void loadWeek(selected.isoYear, selected.isoWeek);
  }

  function copyPrevious() {
    if (!data) return;
    const previous = new Date(`${data.dates[0]}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    const selected = getIsoWeek(previous);
    void loadWeek(data.sheet.isoYear, data.sheet.isoWeek, {
      year: selected.isoYear,
      week: selected.isoWeek,
    });
  }

  if (!data)
    return (
      <section className="card">
        <p>{message}</p>
      </section>
    );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time reporting</div>
          <h1>
            Week {data.sheet.isoWeek}, {data.sheet.isoYear}
          </h1>
          <p className="muted">
            {data.dates[0]} to {data.dates[6]}
          </p>
        </div>
        <span className="status">{data.sheet.status}</span>
      </div>
      {success && (
        <div className="toast toast-success" role="status">
          <span className="toast-icon">✓</span>
          <span>{success}</span>
          <button aria-label="Dismiss" onClick={() => setSuccess("")}>
            ×
          </button>
        </div>
      )}
      <section className="card timesheet-controls">
        <div>
          <strong>Reporting week</strong>
          <div
            className="week-mode-picker"
            role="radiogroup"
            aria-label="Choose how to select a reporting week"
          >
            {(["current", "number", "date"] as const).map((mode) => (
              <label key={mode} className={weekMode === mode ? "selected" : ""}>
                <input
                  type="radio"
                  name="weekMode"
                  value={mode}
                  checked={weekMode === mode}
                  onChange={() => {
                    setWeekMode(mode);
                    setCopyMode("");
                    if (mode === "current") void loadWeek();
                  }}
                />
                {mode === "current"
                  ? "Current week"
                  : mode === "number"
                    ? "Week number"
                    : "Calendar date"}
              </label>
            ))}
          </div>
          {weekMode === "number" && (
            <div className="actions selection-panel">
              <label>
                Year
                <input
                  className="field compact-field"
                  type="number"
                  value={yearInput}
                  onChange={(event) => setYearInput(Number(event.target.value))}
                />
              </label>
              <label>
                Week
                <input
                  className="field compact-field"
                  type="number"
                  min="1"
                  max="53"
                  value={weekInput}
                  onChange={(event) => setWeekInput(Number(event.target.value))}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => void loadWeek(yearInput, weekInput)}
              >
                Open week
              </button>
            </div>
          )}
          {weekMode === "date" && (
            <div className="selection-panel">
              <label>
                Choose any date in the week
                <input
                  className="field"
                  type="date"
                  onChange={(event) => selectCalendarDate(event.target.value)}
                />
              </label>
              <small className="muted">
                The full Monday to Sunday week opens automatically.
              </small>
            </div>
          )}
        </div>
        <div className="copy-from-control">
          <div className="actions copy-from-row">
            <strong>Copy from</strong>
            <select
              className="field copy-from-select"
              value={copyMode}
              onChange={(event) => {
                setCopyMode(event.target.value);
                if (event.target.value === "previous") copyPrevious();
              }}
            >
              <option value="">Enter manually</option>
              <option value="previous">Previous week</option>
              <option value="custom">Choose week number</option>
            </select>
            {copyMode === "custom" && (
              <>
                <input
                  className="field compact-field"
                  type="number"
                  value={copyYear}
                  onChange={(event) => setCopyYear(Number(event.target.value))}
                  aria-label="Copy year"
                />
                <input
                  className="field compact-field"
                  type="number"
                  min="1"
                  max="53"
                  value={copyWeek}
                  onChange={(event) => setCopyWeek(Number(event.target.value))}
                  aria-label="Copy week"
                />
                <button
                  className="button secondary"
                  onClick={() =>
                    void loadWeek(data.sheet.isoYear, data.sheet.isoWeek, {
                      year: copyYear,
                      week: copyWeek,
                    })
                  }
                >
                  Copy
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      {data.sheet.rejectionReason && (
        <p className="notice">Rejected: {data.sheet.rejectionReason}</p>
      )}
      <section className="metrics">
        <div className="metric">
          <span>Expected</span>
          <strong>{formatDuration(data.sheet.expectedMinutes)}</strong>
        </div>
        <div className="metric">
          <span>Reported</span>
          <strong>{formatDuration(reported)}</strong>
        </div>
      </section>
      <section className="card table-wrap">
        <table className="timesheet-grid">
          <thead>
            <tr>
              <th>Time code</th>
              {data.dates.map((date, day) => (
                <th
                  key={date}
                  className={data.redDays[day]?.isRed ? "red-day" : ""}
                >
                  {dayNames[day]}
                  <small>{date.slice(8, 10)}</small>
                </th>
              ))}
              <th>Total</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <select
                    className="field"
                    value={row.timeCodeId}
                    disabled={
                      !editable ||
                      data.codes.find((code) => code.id === row.timeCodeId)
                        ?.category === "work"
                    }
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, timeCodeId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    {data.codes.map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.code}
                      </option>
                    ))}
                  </select>
                </td>
                {row.minutes.map((minutes, day) => (
                  <td
                    key={data.dates[day]}
                    className={
                      data.redDays[day]?.isRed ? "red-day red-day-cell" : ""
                    }
                  >
                    <input
                      className="field time-cell"
                      type="number"
                      min="0"
                      max="24"
                      step=".25"
                      value={minutes ? minutes / 60 : ""}
                      placeholder="0"
                      disabled={!editable}
                      aria-label={`${dayNames[day]} hours`}
                      onChange={(event) =>
                        changeMinutes(row, day, Number(event.target.value))
                      }
                    />
                  </td>
                ))}
                <td>
                  <strong>
                    {formatDuration(
                      row.minutes.reduce((sum, value) => sum + value, 0),
                    )}
                  </strong>
                </td>
                <td>
                  <button
                    className="icon-button"
                    disabled={
                      !editable ||
                      data.codes.find((code) => code.id === row.timeCodeId)
                        ?.category === "work"
                    }
                    aria-label="Remove row"
                    onClick={() =>
                      setRows((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="actions timesheet-actions">
            <button
              className="button secondary"
              disabled={!data.codes.length}
              onClick={addRow}
            >
              Add row
            </button>
            <span className="actions-spacer" />
            <button className="button secondary" onClick={() => void save()}>
              Save
            </button>
            <button
              className="button"
              disabled={
                reported < data.sheet.expectedMinutes || !data.codes.length
              }
              onClick={() => {
                if (submitWarnings.length) {
                  setConfirmation("");
                  setConfirmOpen(true);
                } else void performSubmit();
              }}
            >
              Submit
            </button>
          </div>
        )}
        {!editable && (
          <div className="actions timesheet-actions">
            <span className="actions-spacer" />
            <button
              className="button"
              onClick={() =>
                setMessage(
                  "You already reported this week. Delete the old draft if you want to report again, or edit that draft.",
                )
              }
            >
              Submit
            </button>
          </div>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
      {confirmOpen && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="submit-warning-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">Review warnings</span>
                <h2 id="submit-warning-title">Submit this time report?</h2>
                <p>
                  Please review the unusual reporting conditions before
                  continuing.
                </p>
              </div>
            </header>
            <ul className="warning-list">
              {submitWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <label>
              Type <strong>I am sure</strong> to submit
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setConfirmOpen(false)}
              >
                Review report
              </button>
              <button
                className="button danger"
                disabled={confirmation !== "I am sure"}
                onClick={() => void performSubmit()}
              >
                Submit anyway
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
