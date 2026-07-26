"use client";

import { useMemo, useRef, useState } from "react";
import { formatDuration } from "@/lib/durations/duration";

type Entry = { id: number; code: string; minutes: number; comment: string };
const days = [
  ["Måndag", "27 juli"],
  ["Tisdag", "28 juli"],
  ["Onsdag", "29 juli"],
  ["Torsdag", "30 juli"],
  ["Fredag", "31 juli"],
  ["Lördag", "1 augusti"],
  ["Söndag", "2 augusti"],
];
const codes = [
  "REG",
  "VAC",
  "PARENTAL",
  "SICK",
  "VAB",
  "UNPAID",
  "OVERTIME",
  "COMP",
];
const initial: Record<number, Entry[]> = {
  0: [{ id: 1, code: "REG", minutes: 480, comment: "" }],
  1: [{ id: 2, code: "REG", minutes: 480, comment: "" }],
  2: [
    { id: 3, code: "REG", minutes: 360, comment: "" },
    { id: 4, code: "PARENTAL", minutes: 120, comment: "Hämtning förskola" },
  ],
};

export function WeeklyTimesheet() {
  const [entries, setEntries] = useState(initial);
  const [saved, setSaved] = useState(false);
  const nextEntryId = useRef(10);
  const reported = useMemo(
    () =>
      Object.values(entries)
        .flat()
        .reduce((sum, entry) => sum + entry.minutes, 0),
    [entries],
  );
  const worked = useMemo(
    () =>
      Object.values(entries)
        .flat()
        .filter((entry) => ["REG", "OVERTIME"].includes(entry.code))
        .reduce((sum, entry) => sum + entry.minutes, 0),
    [entries],
  );
  const expected = 2_400;
  function patch(day: number, id: number, patchValue: Partial<Entry>) {
    setSaved(false);
    setEntries((current) => ({
      ...current,
      [day]: (current[day] ?? []).map((entry) =>
        entry.id === id ? { ...entry, ...patchValue } : entry,
      ),
    }));
  }
  function add(day: number) {
    const id = nextEntryId.current++;
    setEntries((current) => ({
      ...current,
      [day]: [
        ...(current[day] ?? []),
        { id, code: "REG", minutes: 480, comment: "" },
      ],
    }));
  }
  function remove(day: number, id: number) {
    setEntries((current) => ({
      ...current,
      [day]: (current[day] ?? []).filter((entry) => entry.id !== id),
    }));
  }
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Tidrapportering</div>
          <h1>Vecka 31</h1>
          <div className="muted">27 juli–2 augusti 2026 · Europe/Stockholm</div>
        </div>
        <span className="status">Utkast</span>
      </div>
      <section className="metrics" aria-label="Veckosammanfattning">
        {[
          ["Förväntat", expected],
          ["Rapporterat", reported],
          ["Arbetat", worked],
          ["Frånvaro", reported - worked],
          ["Differens", reported - expected],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="muted">{label}</span>
            <strong>{formatDuration(value as number)}</strong>
          </div>
        ))}
      </section>
      <section className="card">
        <div className="week-head">
          <div className="week-nav">
            <button className="icon-button" aria-label="Föregående vecka">
              ←
            </button>
            <button className="icon-button" aria-label="Nästa vecka">
              →
            </button>
          </div>
          <div className="actions">
            <button className="button secondary" onClick={() => setSaved(true)}>
              {saved ? "Sparat ✓" : "Spara utkast"}
            </button>
            <button className="button" disabled={reported !== expected}>
              Skicka in veckan
            </button>
          </div>
        </div>
        {reported !== expected && (
          <p className="notice" role="status">
            Rapporterad tid skiljer sig från förväntad tid med{" "}
            {formatDuration(reported - expected)}. Kontrollera veckan före
            inskick.
          </p>
        )}
        <div className="days">
          {days.map(([name, date], day) => {
            const dayEntries = entries[day] ?? [];
            const total = dayEntries.reduce(
              (sum, entry) => sum + entry.minutes,
              0,
            );
            return (
              <article className="day" key={name}>
                <header className="day-head">
                  <div>
                    <strong>{name}</strong>
                    <div className="muted">{date}</div>
                  </div>
                  <span className="muted">
                    Förväntat {day < 5 ? "8 h" : "0 min"}
                  </span>
                  <strong>{formatDuration(total)}</strong>
                </header>
                {dayEntries.map((entry) => (
                  <div className="entry" key={entry.id}>
                    <select
                      className="field"
                      aria-label={`Tidkod ${name}`}
                      value={entry.code}
                      onChange={(event) =>
                        patch(day, entry.id, { code: event.target.value })
                      }
                    >
                      {codes.map((code) => (
                        <option key={code}>{code}</option>
                      ))}
                    </select>
                    <input
                      className="field"
                      aria-label={`Minuter ${name}`}
                      type="number"
                      min="1"
                      max="1440"
                      value={entry.minutes}
                      onChange={(event) =>
                        patch(day, entry.id, {
                          minutes: Number(event.target.value),
                        })
                      }
                    />
                    <input
                      className="field"
                      aria-label={`Kommentar ${name}`}
                      type="text"
                      placeholder="Kommentar (valfri)"
                      value={entry.comment}
                      onChange={(event) =>
                        patch(day, entry.id, { comment: event.target.value })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`Ta bort rad ${name}`}
                      onClick={() => remove(day, entry.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="entry-empty">
                  <button className="button secondary" onClick={() => add(day)}>
                    + Lägg till rad
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
