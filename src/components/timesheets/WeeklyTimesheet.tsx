"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";
import {
  getIsoWeek,
  getIsoWeekDates,
  splitWeekByMonth,
} from "@/lib/dates/iso-week";

type Code = {
  id: string;
  code: string;
  category: string;
  countsAsWorkedTime: boolean;
};
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
  part: number;
  partCount: number;
  latestReported: {
    isoYear: number;
    isoWeek: number;
    periodStart: string;
    periodEnd: string;
  } | null;
};
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function entriesToRows(data: Data, entries: StoredEntry[]): Row[] {
  const rows = new Map<string, Row>();
  for (const entry of entries) {
    const row = rows.get(entry.timeCodeId) ?? {
      key: entry.timeCodeId,
      timeCodeId: entry.timeCodeId,
      minutes: Array(data.dates.length).fill(0) as number[],
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
      minutes: Array(data.dates.length).fill(0) as number[],
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
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nonWorkingOpen, setNonWorkingOpen] = useState(false);
  const [autoApproving, setAutoApproving] = useState(false);
  const editable = data && data.sheet.status === "draft";
  const periodLabel = data
    ? `Week ${data.sheet.isoWeek}${
        data.partCount > 1 ? `-${String(data.part).padStart(2, "0")}` : ""
      }`
    : "";

  async function loadWeek(
    year?: number,
    week?: number,
    copy?: { year: number; week: number },
    part?: number,
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
    if (part) query.set("part", String(part));
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
      setNonWorkingOpen(
        loaded.sheet.status === "draft" &&
          loaded.sheet.expectedMinutes === 0 &&
          !copy,
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
    const selectedPart = Number(params.get("part"));
    const timeout = window.setTimeout(() => {
      if (selectedYear && selectedWeek) {
        setWeekMode("number");
        void loadWeek(
          selectedYear,
          selectedWeek,
          undefined,
          selectedPart || undefined,
        );
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
        minutes: Array(data.dates.length).fill(0) as number[],
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

  function changeTimeCode(row: Row, timeCodeId: string) {
    if (!data) return;
    const code = data.codes.find((item) => item.id === timeCodeId);
    const minutes =
      code?.countsAsWorkedTime === true
        ? row.minutes
        : row.minutes.map((value, day) =>
            data.redDays[day]?.isRed ? 0 : value,
          );
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, timeCodeId, minutes } : item,
      ),
    );
  }

  function formatReportingDay(date: string) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replace(",", "");
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
        part: String(data.part),
      });
      const response = await fetch(`/api/timesheets/current?${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const result = await response.json().catch(() => ({}));
      const feedback = response.ok
        ? "Saved."
        : (result.error ?? "The time report could not be saved.");
      setMessage(feedback);
      if (!response.ok) setSubmitError(feedback);
      return response.ok;
    } catch {
      const feedback = "The time report could not be saved. Please try again.";
      setMessage(feedback);
      setSubmitError(feedback);
      return false;
    }
  }

  async function performSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      if (!(await save()) || !data) return;
      const response = await fetch(`/api/timesheets/${data.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const feedback =
          result.error ??
          "You already reported this week. Delete the draft to report again, or edit the existing draft.";
        setMessage(feedback);
        setSubmitError(feedback);
        return;
      }
      setConfirmOpen(false);
      setConfirmation("");
      setRows([]);
      setSuccess("Time reported successfully");
      await loadWeek();
    } catch {
      const feedback =
        "The report could not be submitted. Please try again. Your draft is still saved.";
      setMessage(feedback);
      setSubmitError(feedback);
    } finally {
      setSubmitting(false);
    }
  }

  async function approveNonWorkingPeriod() {
    if (!data) return;
    setAutoApproving(true);
    setSubmitError("");
    const query = new URLSearchParams({
      year: String(data.sheet.isoYear),
      week: String(data.sheet.isoWeek),
      part: String(data.part),
    });
    try {
      const response = await fetch(`/api/timesheets/current?${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entries: [],
          autoApproveNonWorking: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSubmitError(
          result.error ?? "The zero-hour report could not be created.",
        );
        return;
      }
      setNonWorkingOpen(false);
      setSuccess("0 hours reported and approved successfully");
      await loadWeek();
    } catch {
      setSubmitError(
        "The zero-hour report could not be created. Please try again.",
      );
    } finally {
      setAutoApproving(false);
    }
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

  function goToNextWeek() {
    if (!data) return;
    setWeekMode("number");
    setCopyMode("");
    setSuccess("");
    if (data.part < data.partCount) {
      void loadWeek(
        data.sheet.isoYear,
        data.sheet.isoWeek,
        undefined,
        data.part + 1,
      );
      return;
    }
    const next = new Date(`${data.dates[0]}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    const selected = getIsoWeek(next);
    void loadWeek(selected.isoYear, selected.isoWeek);
  }

  function goToPreviousWeek() {
    if (!data) return;
    setWeekMode("number");
    setCopyMode("");
    setSuccess("");
    if (data.part > 1) {
      void loadWeek(
        data.sheet.isoYear,
        data.sheet.isoWeek,
        undefined,
        data.part - 1,
      );
      return;
    }
    const previous = new Date(`${data.dates[0]}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    const selected = getIsoWeek(previous);
    const previousPartCount = splitWeekByMonth(
      getIsoWeekDates(selected.isoYear, selected.isoWeek),
    ).length;
    void loadWeek(
      selected.isoYear,
      selected.isoWeek,
      undefined,
      previousPartCount,
    );
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
          <h1>Report time</h1>
          <p className="muted page-description">
            Choose a reporting period, enter hours by time code and review the
            report before submitting it for approval.
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
        {data.latestReported && (
          <p className="latest-report-hint">
            <span>Latest submitted report</span>
            <strong>
              Week {data.latestReported.isoWeek}:{" "}
              {data.latestReported.periodStart.replaceAll("-", "/")} to{" "}
              {data.latestReported.periodEnd.replaceAll("-", "/")}
            </strong>
          </p>
        )}
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
                  ? "Current or next available week"
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
      <div className="timesheet-table-actions">
        <button className="button secondary" onClick={goToPreviousWeek}>
          Go to previous week
        </button>
        <button className="button secondary" onClick={goToNextWeek}>
          Go to next week
        </button>
      </div>
      <section className="card table-wrap">
        <div className="timesheet-table-header">
          <div>
            <span className="eyebrow">Reporting period</span>
            <strong>
              Week {data.sheet.isoWeek}
              {data.partCount > 1
                ? `-${String(data.part).padStart(2, "0")}`
                : ""}
            </strong>
          </div>
          <span>
            From {data.dates[0]?.replaceAll("-", "/")} to{" "}
            {data.dates.at(-1)?.replaceAll("-", "/")}
          </span>
        </div>
        <table className="timesheet-grid">
          <thead>
            <tr>
              <th>Time code</th>
              {data.dates.map((date, day) => (
                <th
                  key={date}
                  className={data.redDays[day]?.isRed ? "red-day" : ""}
                >
                  {
                    dayNames[
                      (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
                    ]
                  }
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
                    disabled={!editable}
                    onChange={(event) =>
                      changeTimeCode(row, event.target.value)
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
                      disabled={
                        !editable ||
                        (data.redDays[day]?.isRed &&
                          data.codes.find((code) => code.id === row.timeCodeId)
                            ?.countsAsWorkedTime !== true)
                      }
                      aria-label={`${data.dates[day]} hours`}
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
                    disabled={!editable}
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
            <button
              className="button"
              disabled={
                reported < data.sheet.expectedMinutes || !data.codes.length
              }
              onClick={() => {
                if (reported === 0 && data.sheet.expectedMinutes === 0) {
                  setSubmitError("");
                  setNonWorkingOpen(true);
                } else if (submitWarnings.length) {
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
            {submitError && (
              <p className="notice notice-error" role="alert">
                {submitError}
              </p>
            )}
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
                disabled={confirmation !== "I am sure" || submitting}
                onClick={() => void performSubmit()}
              >
                {submitting ? "Submitting..." : "Submit anyway"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {nonWorkingOpen && data.sheet.status === "draft" && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="non-working-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">Non-working period</span>
                <h2 id="non-working-title">
                  This week has only non-working days
                </h2>
                <p>Days to report in {periodLabel}:</p>
                <ul className="reporting-day-list">
                  {data.dates.map((date) => (
                    <li key={date}>{formatReportingDay(date)}</li>
                  ))}
                </ul>
                <p>
                  Would you like to report 0 working hours? The report will be
                  approved automatically and will not require manager review.
                  Select No if you worked on one of these red days and need to
                  enter working time.
                </p>
              </div>
            </header>
            {submitError && (
              <p className="notice notice-error">{submitError}</p>
            )}
            <footer className="modal-actions">
              <button
                className="button secondary"
                disabled={autoApproving}
                onClick={() => {
                  setSubmitError("");
                  setNonWorkingOpen(false);
                }}
              >
                No
              </button>
              <button
                className="button"
                disabled={autoApproving}
                onClick={() => void approveNonWorkingPeriod()}
              >
                {autoApproving ? "Reporting..." : "Yes, report 0 hours"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
