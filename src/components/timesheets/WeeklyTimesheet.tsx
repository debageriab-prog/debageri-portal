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
  const editable =
    data && ["draft", "rejected", "reopened"].includes(data.sheet.status);

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
    // The async loader updates state only after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWeek();
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
    if (
      minutes > 0 &&
      !row.minutes[day] &&
      data.redDays[day]?.isRed &&
      !window.confirm(
        `You are reporting time on a red day (${data.redDays[day]?.reason}). Are you sure you want to proceed?`,
      )
    )
      return;
    const next = [...row.minutes];
    next[day] = minutes;
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, minutes: next } : item,
      ),
    );
  }

  function confirmWarnings(action: "proceed" | "submit") {
    if (
      reportedRedDays.length &&
      !window.confirm(
        `This report includes time on ${reportedRedDays.length} red ${reportedRedDays.length === 1 ? "day" : "days"}. Are you sure you want to ${action}?`,
      )
    )
      return false;
    if (
      reported > 2400 &&
      !window.confirm(
        `Total reported time exceeds 40 hours for this week. Are you sure you want to ${action}?`,
      )
    )
      return false;
    return true;
  }

  async function save(confirmBeforeSave = true) {
    if (!data) return false;
    if (confirmBeforeSave && !confirmWarnings("proceed")) return false;
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

  async function submit() {
    if (!confirmWarnings("submit")) return;
    if (!(await save(false)) || !data) return;
    const response = await fetch(`/api/timesheets/${data.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(result.error);
    setData((current) =>
      current
        ? { ...current, sheet: { ...current.sheet, status: "submitted" } }
        : current,
    );
    setMessage("Submitted for approval.");
  }

  function selectMonday(value: string) {
    if (!value) return;
    const date = new Date(`${value}T12:00:00Z`);
    if (date.getUTCDay() !== 1) {
      setMessage("Select a Monday as the start of the reporting week.");
      return;
    }
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
      <section className="card timesheet-controls">
        <div>
          <strong>Reporting week</strong>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => {
                setCopyMode("");
                void loadWeek();
              }}
            >
              Current week
            </button>
            <input
              className="field compact-field"
              type="number"
              value={yearInput}
              onChange={(event) => setYearInput(Number(event.target.value))}
              aria-label="ISO year"
            />
            <input
              className="field compact-field"
              type="number"
              min="1"
              max="53"
              value={weekInput}
              onChange={(event) => setWeekInput(Number(event.target.value))}
              aria-label="ISO week"
            />
            <button
              className="button secondary"
              onClick={() => {
                setCopyMode("");
                void loadWeek(yearInput, weekInput);
              }}
            >
              Open week
            </button>
            <label>
              Week starts{" "}
              <input
                className="field"
                type="date"
                onChange={(event) => selectMonday(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div>
          <strong>Copy from</strong>
          <div className="actions">
            <select
              className="field"
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
      {reported > 2400 && (
        <p className="notice notice-warning">
          This week exceeds 40 reported hours. Confirm the warning before saving
          or submitting.
        </p>
      )}
      {reportedRedDays.map((day) => (
        <p className="notice notice-warning" key={day.date}>
          You are reporting time on {day.date}, a red day ({day.reason}).
        </p>
      ))}
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
              onClick={() => void submit()}
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
    </>
  );
}
