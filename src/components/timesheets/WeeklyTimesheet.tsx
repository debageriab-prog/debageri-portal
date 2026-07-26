"use client";

import { useMemo, useRef, useState } from "react";
import { formatDuration } from "@/lib/durations/duration";
import { useLocale } from "@/components/localization/LocaleProvider";

type Entry = { id: number; code: string; minutes: number; comment: string };
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
  const { locale, t } = useLocale();
  const days = [
    [t("monday"), t("july27")],
    [t("tuesday"), t("july28")],
    [t("wednesday"), t("july29")],
    [t("thursday"), t("july30")],
    [t("friday"), t("july31")],
    [t("saturday"), t("august1")],
    [t("sunday"), t("august2")],
  ];
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
          <div className="eyebrow">{t("timeReporting")}</div>
          <h1>{t("week")} 31</h1>
          <div className="muted">{t("dateRange")}</div>
        </div>
        <span className="status">{t("draft")}</span>
      </div>
      <section className="metrics" aria-label={t("weekSummary")}>
        {[
          [t("expected"), expected],
          [t("reported"), reported],
          [t("worked"), worked],
          [t("absence"), reported - worked],
          [t("difference"), reported - expected],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="muted">{label}</span>
            <strong>{formatDuration(value as number, locale)}</strong>
          </div>
        ))}
      </section>
      <section className="card">
        <div className="week-head">
          <div className="week-nav">
            <button className="icon-button" aria-label={t("previousWeek")}>
              ←
            </button>
            <button className="icon-button" aria-label={t("nextWeek")}>
              →
            </button>
          </div>
          <div className="actions">
            <button className="button secondary" onClick={() => setSaved(true)}>
              {saved ? t("saved") : t("save")}
            </button>
            <button className="button" disabled={reported !== expected}>
              {t("submitWeek")}
            </button>
          </div>
        </div>
        {reported !== expected && (
          <p className="notice" role="status">
            {t("expectedShortfall").replace(
              "{duration}",
              formatDuration(reported - expected, locale),
            )}
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
                    {t("expected")} {day < 5 ? "8 h" : "0 min"}
                  </span>
                  <strong>{formatDuration(total, locale)}</strong>
                </header>
                {dayEntries.map((entry) => (
                  <div className="entry" key={entry.id}>
                    <select
                      className="field"
                      aria-label={`${t("code")} ${name}`}
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
                      aria-label={`${t("minutes")} ${name}`}
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
                      aria-label={`${t("comment")} ${name}`}
                      type="text"
                      placeholder={t("optionalComment")}
                      value={entry.comment}
                      onChange={(event) =>
                        patch(day, entry.id, { comment: event.target.value })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`${t("removeEntry")} ${name}`}
                      onClick={() => remove(day, entry.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="entry-empty">
                  <button className="button secondary" onClick={() => add(day)}>
                    {t("addEntry")}
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
