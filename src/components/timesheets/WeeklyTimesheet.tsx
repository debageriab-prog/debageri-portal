"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";

type Code = {
  id: string;
  code: string;
  name: { sv?: string; en?: string };
};
type StoredEntry = {
  id: string;
  date: string;
  timeCodeId: string;
  minutes: number;
};
type Row = {
  key: string;
  timeCodeId: string;
  minutes: number[];
};
type Data = {
  id: string;
  dates: string[];
  schedule: Record<string, number>;
  sheet: {
    isoYear: number;
    isoWeek: number;
    status: string;
    expectedMinutes: number;
    rejectionReason?: string | null;
  };
  codes: Code[];
  entries: StoredEntry[];
};
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function entriesToRows(data: Data): Row[] {
  const rows = new Map<string, Row>();
  for (const entry of data.entries) {
    const row = rows.get(entry.timeCodeId) ?? {
      key: entry.timeCodeId,
      timeCodeId: entry.timeCodeId,
      minutes: Array(7).fill(0) as number[],
    };
    const day = data.dates.indexOf(entry.date);
    if (day >= 0) row.minutes[day] = (row.minutes[day] ?? 0) + entry.minutes;
    rows.set(entry.timeCodeId, row);
  }
  return [...rows.values()];
}

export function WeeklyTimesheet() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("Loading...");
  const editable =
    data && ["draft", "rejected", "reopened"].includes(data.sheet.status);

  useEffect(() => {
    fetch("/api/timesheets/current")
      .then(async (response) => {
        if (response.status === 401) return router.replace("/auth/login");
        const result = await response.json();
        if (!response.ok) return setMessage(result.error);
        setData(result.data);
        setRows(entriesToRows(result.data));
        setMessage("");
      })
      .catch(() => setMessage("The time report could not be loaded."));
  }, [router]);

  const reported = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total + row.minutes.reduce((sum, minutes) => sum + minutes, 0),
        0,
      ),
    [rows],
  );

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

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
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
      const response = await fetch("/api/timesheets/current", {
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
    if (!(await save()) || !data) return;
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
          <p className="muted page-description">
            Use one row per time code and enter hours under each day. Add
            separate rows for work, vacation, parental leave or other time.
          </p>
        </div>
        <span className="status">{data.sheet.status}</span>
      </div>
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
        {!data.codes.length && (
          <p className="notice">No active time codes are configured.</p>
        )}
        <table className="timesheet-grid">
          <thead>
            <tr>
              <th>Time code</th>
              {data.dates.map((date, day) => (
                <th key={date}>
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
                    disabled={!editable}
                    onChange={(event) =>
                      patchRow(row.key, { timeCodeId: event.target.value })
                    }
                  >
                    {data.codes.map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.code}: {code.name.en ?? code.name.sv}
                      </option>
                    ))}
                  </select>
                </td>
                {row.minutes.map((minutes, day) => (
                  <td key={data.dates[day]}>
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
                      onChange={(event) => {
                        const next = [...row.minutes];
                        next[day] = Math.round(Number(event.target.value) * 60);
                        patchRow(row.key, { minutes: next });
                      }}
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
            <button className="button secondary" onClick={save}>
              Save
            </button>
            <button
              className="button"
              disabled={
                reported !== data.sheet.expectedMinutes || !data.codes.length
              }
              onClick={submit}
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
