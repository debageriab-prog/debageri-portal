"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";

type Code = {
  id: string;
  code: string;
  name: { sv?: string; en?: string };
  requiresComment: boolean;
};
type Entry = {
  key: string;
  date: string;
  timeCodeId: string;
  minutes: number;
  comment: string;
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
  entries: Array<Entry & { id: string }>;
};
const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const scheduleKeys = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function WeeklyTimesheet() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("Loading…");
  const editable =
    data && ["draft", "rejected", "reopened"].includes(data.sheet.status);
  useEffect(() => {
    fetch("/api/timesheets/current").then(async (response) => {
      if (response.status === 401) return router.replace("/auth/login");
      const result = await response.json();
      if (!response.ok) return setMessage(result.error);
      setData(result.data);
      setEntries(
        result.data.entries.map((entry: Entry & { id: string }) => ({
          ...entry,
          key: entry.id,
          comment: entry.comment ?? "",
        })),
      );
      setMessage("");
    });
  }, [router]);
  const reported = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.minutes, 0),
    [entries],
  );
  function add(date: string) {
    if (!data?.codes.length) return;
    setEntries((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        date,
        timeCodeId: data.codes[0]!.id,
        minutes: 60,
        comment: "",
      },
    ]);
  }
  function patch(key: string, value: Partial<Entry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, ...value } : entry,
      ),
    );
  }
  async function save() {
    setMessage("Saving…");
    const response = await fetch("/api/timesheets/current", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: entries.map(({ date, timeCodeId, minutes, comment }) => ({
          date,
          timeCodeId,
          minutes,
          comment: comment || null,
        })),
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Saved." : result.error);
    return response.ok;
  }
  async function submit() {
    if (!(await save())) return;
    const response = await fetch(`/api/timesheets/${data!.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
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
            {data.dates[0]} – {data.dates[6]}
          </p>
          <p className="muted page-description">
            Add time for each day, save as you go and submit the completed week
            for approval.
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
      <section className="card">
        {!data.codes.length && (
          <p className="notice">
            No active time codes are configured. Ask an administrator to add
            one.
          </p>
        )}
        {data.dates.map((date, day) => (
          <article className="day" key={date}>
            <header className="day-head">
              <strong>
                {dayNames[day]} · {date}
              </strong>
              <span>
                Expected{" "}
                {formatDuration(Number(data.schedule[scheduleKeys[day]!] ?? 0))}
              </span>
            </header>
            {entries
              .filter((entry) => entry.date === date)
              .map((entry) => (
                <div className="entry" key={entry.key}>
                  <select
                    className="field"
                    value={entry.timeCodeId}
                    disabled={!editable}
                    onChange={(event) =>
                      patch(entry.key, { timeCodeId: event.target.value })
                    }
                  >
                    {data.codes.map((code) => (
                      <option value={code.id} key={code.id}>
                        {code.code}: {code.name.en ?? code.name.sv}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    max="1440"
                    value={entry.minutes}
                    disabled={!editable}
                    onChange={(event) =>
                      patch(entry.key, { minutes: Number(event.target.value) })
                    }
                  />
                  <input
                    className="field"
                    value={entry.comment}
                    disabled={!editable}
                    placeholder="Comment"
                    onChange={(event) =>
                      patch(entry.key, { comment: event.target.value })
                    }
                  />
                  <button
                    className="icon-button"
                    disabled={!editable}
                    onClick={() =>
                      setEntries((current) =>
                        current.filter((item) => item.key !== entry.key),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            {editable && (
              <div className="entry-empty">
                <button
                  className="button secondary"
                  disabled={!data.codes.length}
                  onClick={() => add(date)}
                >
                  Add entry
                </button>
              </div>
            )}
          </article>
        ))}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {editable && (
          <div className="actions" style={{ marginTop: 18 }}>
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
      </section>
    </>
  );
}
