"use client";

import { useMemo, useState } from "react";
import { formatDuration } from "@/lib/durations/duration";
import { getIsoWeekDates } from "@/lib/dates/iso-week";
import { ConsultantAvatar } from "./ConsultantAvatar";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  aggregateReportedDays,
  aggregateReportedMinutes,
  combineReportedTotals,
  type ReportedTotals,
} from "@/domain/reports/aggregate";
import { isAfterEmployment } from "@/domain/timesheets/rules";

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

type PeriodSummary = {
  hours: ReportedTotals;
  days: ReportedTotals;
  income: { worked: number; notReached: number } | null;
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

  function summarize(consultant: Consultant): PeriodSummary {
    const selected = entries.filter(
      (entry) =>
        entry.userId === consultant.id &&
        entry.date >= start &&
        entry.date <= end,
    );
    const expected = expectedMinutes(consultant);
    const time = {
      hours: aggregateReportedMinutes(selected, expected),
      days: aggregateReportedDays(selected, expected),
    };
    if (!showEstimatedIncome || consultant.role === "employee")
      return { ...time, income: null };

    const workedIncome = selected
      .filter((entry) => entry.countsAsWorkedTime)
      .reduce(
        (sum, entry) =>
          sum +
          (entry.minutes / 60) * (entry.hourlyRate || consultant.hourlyRate),
        0,
      );
    const possibleIncome = (expected / 60) * consultant.hourlyRate;
    return {
      ...time,
      income: {
        worked: workedIncome,
        notReached: Math.max(0, possibleIncome - workedIncome),
      },
    };
  }

  function combine(summaries: PeriodSummary[]): PeriodSummary {
    const incomes = summaries.flatMap((summary) =>
      summary.income ? [summary.income] : [],
    );
    return {
      hours: combineReportedTotals(summaries.map((summary) => summary.hours)),
      days: combineReportedTotals(summaries.map((summary) => summary.days)),
      income:
        incomes.length > 0
          ? {
              worked: incomes.reduce((sum, item) => sum + item.worked, 0),
              notReached: incomes.reduce(
                (sum, item) => sum + item.notReached,
                0,
              ),
            }
          : null,
    };
  }

  function charts({ hours, days, income }: PeriodSummary) {
    const segmentsFor = (totals: ReportedTotals) =>
      [
        { label: t("worked"), value: totals.worked, color: colors[0]! },
        ...[...totals.byCode].map(([label, value], index) => ({
          label,
          value,
          color: colors[(index % (colors.length - 1)) + 1]!,
        })),
        {
          label: t("notReported"),
          value: totals.unreported,
          color: "#ddd3ca",
        },
      ].filter((segment) => segment.value > 0);
    const formatDays = (minutes: number) => {
      const days = minutes / 480;
      return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? t("day") : t("days")}`;
    };
    const formatIncome = (amount: number) =>
      `${new Intl.NumberFormat("en-SE", { maximumFractionDigits: 0 }).format(amount)} SEK`;

    const timeCharts = (["hours", "days"] as const).map((unit) => {
      const totals = unit === "hours" ? hours : days;
      const segments = segmentsFor(totals);
      const total = totals.total;
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
                  ? formatDuration(totals.reported)
                  : formatDays(totals.reported)}
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
    if (!income) return timeCharts;

    const workedIncome = income.worked;
    const notReached = income.notReached;
    const totalIncome = Math.max(workedIncome + notReached, 1);
    const reachedDegrees = (workedIncome / totalIncome) * 360;

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

  function chartGrid(summary: PeriodSummary) {
    return (
      <div
        className={`consultant-chart-grid${
          summary.income ? " income-chart-grid" : ""
        }`}
      >
        {charts(summary)}
      </div>
    );
  }

  const reports = consultants
    .filter(
      (consultant) => !isAfterEmployment(start, consultant.employmentEndDate),
    )
    .map((consultant) => ({ consultant, summary: summarize(consultant) }));

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
        {reports.length > 1 && (
          <article className="card consultant-report-card">
            <header>
              <h2>{t("allConsultantsTotal")}</h2>
            </header>
            {chartGrid(combine(reports.map((report) => report.summary)))}
          </article>
        )}
        {reports.map(({ consultant, summary }) => (
          <article className="card consultant-report-card" key={consultant.id}>
            <header>
              <ConsultantAvatar
                userId={consultant.id}
                displayName={consultant.displayName}
              />
              <h2>{consultant.displayName}</h2>
            </header>
            {chartGrid(summary)}
          </article>
        ))}
      </section>
    </>
  );
}
