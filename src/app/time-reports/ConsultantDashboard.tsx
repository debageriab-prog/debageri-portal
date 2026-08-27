"use client";

import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/durations/duration";
import { getIsoWeekDates } from "@/lib/dates/iso-week";
import { ConsultantAvatar } from "./ConsultantAvatar";
import { useLocale } from "@/components/localization/LocaleProvider";
import { aggregateReportedDays } from "@/domain/reports/aggregate";

type Consultant = {
  id: string;
  displayName: string;
  reportingStartDate: string | null;
  employmentEndDate: string | null;
  role: string;
  hourlyRate: number;
};

type DashboardEntry = {
  userId: string;
  date: string;
  minutes: number;
  name: string;
  countsAsWorkedTime: boolean;
  hourlyRate: number;
};

const colors = ["#35634a", "#a56f4e", "#b88b5d", "#8a7186", "#668a91"];

export function ConsultantDashboard({
  consultants,
  entries,
  holidayDates,
  currentYear,
  currentWeek,
  currentMonth,
  showEstimatedIncome,
}: {
  consultants: Consultant[];
  entries: DashboardEntry[];
  holidayDates: string[];
  currentYear: number;
  currentWeek: number;
  currentMonth: string;
  showEstimatedIncome: boolean;
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState<"year" | "month" | "week">("month");
  const [year, setYear] = useState(currentYear);
  const [week, setWeek] = useState(currentWeek);
  const [month, setMonth] = useState(currentMonth);
  const [start, end] = useMemo(() => {
    if (mode === "year") return [`${year}-01-01`, `${year}-12-31`];
    if (mode === "week") {
      const dates = getIsoWeekDates(year, week);
      return [dates[0]!, dates[6]!];
    }
    const [monthYear, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(
      Date.UTC(monthYear!, monthNumber!, 0),
    ).getUTCDate();
    return [`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`];
  }, [mode, month, week, year]);

  function expectedMinutes(consultant: Consultant) {
    let expected = 0;
    const cursor = new Date(`${start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      const weekday = cursor.getUTCDay();
      if (
        weekday >= 1 &&
        weekday <= 5 &&
        !holidayDates.includes(date) &&
        (!consultant.reportingStartDate ||
          date >= consultant.reportingStartDate) &&
        (!consultant.employmentEndDate || date <= consultant.employmentEndDate)
      )
        expected += 480;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return expected;
  }

  function charts(consultant: Consultant) {
    const selected = entries.filter(
      (entry) =>
        entry.userId === consultant.id &&
        entry.date >= start &&
        entry.date <= end,
    );
    const byCode = new Map<string, number>();
    let worked = 0;
    for (const entry of selected) {
      if (entry.countsAsWorkedTime) worked += entry.minutes;
      else
        byCode.set(entry.name, (byCode.get(entry.name) ?? 0) + entry.minutes);
    }
    const reported = selected.reduce((sum, entry) => sum + entry.minutes, 0);
    const expected = expectedMinutes(consultant);
    const hourSegments = [
      { label: t("worked"), value: worked, color: colors[0]! },
      ...[...byCode].map(([label, value], index) => ({
        label,
        value,
        color: colors[(index % (colors.length - 1)) + 1]!,
      })),
      {
        label: t("notReported"),
        value: Math.max(0, expected - reported),
        color: "#ddd3ca",
      },
    ].filter((segment) => segment.value > 0);
    const dayTotals = aggregateReportedDays(selected, expected);
    const daySegments = [
      { label: t("worked"), value: dayTotals.worked, color: colors[0]! },
      ...[...dayTotals.byCode].map(([label, value], index) => ({
        label,
        value,
        color: colors[(index % (colors.length - 1)) + 1]!,
      })),
      {
        label: t("notReported"),
        value: dayTotals.unreported,
        color: "#ddd3ca",
      },
    ].filter((segment) => segment.value > 0);
    const formatDays = (minutes: number) => {
      const days = minutes / 480;
      return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? t("day") : t("days")}`;
    };
    const formatIncome = (amount: number) =>
      `${new Intl.NumberFormat("en-SE", { maximumFractionDigits: 0 }).format(amount)} SEK`;
    const workedIncome = selected
      .filter((entry) => entry.countsAsWorkedTime)
      .reduce(
        (sum, entry) =>
          sum +
          (entry.minutes / 60) * (entry.hourlyRate || consultant.hourlyRate),
        0,
      );
    const possibleIncome = (expected / 60) * consultant.hourlyRate;
    const notReached = Math.max(0, possibleIncome - workedIncome);
    const totalIncome = Math.max(workedIncome + notReached, 1);
    const reachedDegrees = (workedIncome / totalIncome) * 360;

    const timeCharts = (["hours", "days"] as const).map((unit) => {
      const segments = unit === "hours" ? hourSegments : daySegments;
      const total =
        unit === "hours" ? Math.max(expected, reported, 1) : dayTotals.total;
      let cursor = 0;
      const gradient = segments
        .map((segment) => {
          const segmentStart = (cursor / total) * 360;
          cursor += segment.value;
          return `${segment.color} ${segmentStart}deg ${(cursor / total) * 360}deg`;
        })
        .join(", ");
      return (
        <div className="consultant-summary-chart" key={unit}>
          <div
            className="donut consultant-donut"
            style={{
              background: gradient ? `conic-gradient(${gradient})` : "#eee",
            }}
          >
            <div>
              <strong>
                {unit === "hours"
                  ? formatDuration(reported)
                  : formatDays(dayTotals.reported)}
              </strong>
              <span>
                {t("reported")} {unit === "hours" ? t("hours") : t("days")}
              </span>
            </div>
          </div>
          <div className="chart-legend">
            {segments.map((segment) => (
              <div key={segment.label}>
                <i style={{ background: segment.color }} />
                <span>
                  {segment.label}{" "}
                  <strong>
                    {unit === "hours"
                      ? formatDuration(segment.value)
                      : formatDays(segment.value)}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    });
    if (!showEstimatedIncome || consultant.role === "employee")
      return timeCharts;

    return [
      ...timeCharts,
      <div className="consultant-summary-chart" key="income">
        <div
          className="donut consultant-donut"
          style={{
            background: `conic-gradient(#3b6f9c 0deg ${reachedDegrees}deg, #f3dadd ${reachedDegrees}deg 360deg)`,
          }}
        >
          <div>
            <strong>{formatIncome(workedIncome)}</strong>
            <span>{t("estimatedIncome").toLowerCase()}</span>
          </div>
        </div>
        <div className="chart-legend">
          <div>
            <i style={{ background: "#3b6f9c" }} />
            <span>
              {t("estimatedIncome")}{" "}
              <strong>{formatIncome(workedIncome)}</strong>
            </span>
          </div>
          <div>
            <i style={{ background: "#f3dadd" }} />
            <span>
              {t("notReached")} <strong>{formatIncome(notReached)}</strong>
            </span>
          </div>
        </div>
      </div>,
    ];
  }

  return (
    <>
      <section className="card history-controls consultant-dashboard-controls">
        <div className="week-mode-picker">
          {(["year", "month", "week"] as const).map((item) => (
            <button
              key={item}
              className={mode === item ? "selected" : ""}
              onClick={() => setMode(item)}
            >
              {item === "year"
                ? t("year")
                : item === "month"
                  ? t("month")
                  : t("week")}
            </button>
          ))}
        </div>
        {mode === "month" ? (
          <label>
            {t("month")}
            <input
              className="field"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : (
          <div className="actions">
            <label>
              {t("year")}
              <input
                className="field compact-field"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            {mode === "week" && (
              <label>
                {t("week")}
                <input
                  className="field compact-field"
                  type="number"
                  min="1"
                  max="53"
                  value={week}
                  onChange={(event) => setWeek(Number(event.target.value))}
                />
              </label>
            )}
          </div>
        )}
      </section>
      <section className="consultant-dashboard">
        {consultants.map((consultant) => (
          <article className="card consultant-report-card" key={consultant.id}>
            <header>
              <ConsultantAvatar
                userId={consultant.id}
                displayName={consultant.displayName}
              />
              <h2>{consultant.displayName}</h2>
            </header>
            <div
              className={`consultant-chart-grid${
                showEstimatedIncome && consultant.role !== "employee"
                  ? " income-chart-grid"
                  : ""
              }`}
            >
              {charts(consultant)}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
