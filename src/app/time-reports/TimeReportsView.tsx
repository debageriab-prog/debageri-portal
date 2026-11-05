"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ReportExportButtons } from "@/components/ui/ReportExportButtons";
import { HistoryView } from "@/app/employee/timesheets/HistoryView";
import { shiftMonth } from "@/lib/dates/month";
import { ConsultantDashboard } from "./ConsultantDashboard";

export type ReportPeriod = {
  mode: "year" | "month";
  year: number;
  /** `YYYY-MM` */
  month: string;
};

/** Query string that keeps the chosen period when the page is reloaded. */
function periodQuery(userId: string | undefined, period: ReportPeriod) {
  const query = new URLSearchParams();
  if (userId) query.set("userId", userId);
  query.set("period", period.mode);
  if (period.mode === "year") query.set("year", String(period.year));
  else query.set("month", period.month);
  return `/time-reports?${query}`;
}

/**
 * Staff time reports: one filter bar (consultant, period type, period) above
 * either the all-consultants dashboard or one person's report history. The
 * period lives here, so it survives switching consultant.
 */
export function TimeReportsView({
  users,
  selectedUserId,
  consultantLabel,
  initialPeriod,
  exportUserId,
  dashboard,
  history,
}: {
  users: Array<{ id: string; displayName: string }>;
  selectedUserId?: string;
  consultantLabel: string;
  initialPeriod: ReportPeriod;
  exportUserId?: string;
  dashboard?: Omit<ComponentProps<typeof ConsultantDashboard>, "period">;
  history?: Omit<ComponentProps<typeof HistoryView>, "period">;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [period, setPeriodState] = useState(initialPeriod);

  function setPeriod(next: ReportPeriod) {
    setPeriodState(next);
    window.history.replaceState(null, "", periodQuery(selectedUserId, next));
  }

  function changeMode(mode: ReportPeriod["mode"]) {
    if (mode === "year")
      setPeriod({ ...period, mode, year: Number(period.month.slice(0, 4)) });
    else
      setPeriod({
        ...period,
        mode,
        month: `${period.year}-${period.month.slice(5, 7)}`,
      });
  }

  const yearValid = Number.isInteger(period.year) && period.year >= 1;

  return (
    <>
      <section className="card finance-filter-bar finance-filter-bar-wide time-report-filters">
        <label>
          {consultantLabel}
          <select
            className="field"
            value={selectedUserId ?? ""}
            onChange={(event) =>
              router.push(periodQuery(event.target.value || undefined, period))
            }
          >
            <option value="">{t("allConsultants")}</option>
            {users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("periodType")}
          <select
            className="field"
            value={period.mode}
            onChange={(event) =>
              changeMode(event.target.value as ReportPeriod["mode"])
            }
          >
            <option value="month">{t("month")}</option>
            <option value="year">{t("year")}</option>
          </select>
        </label>
        <div className="finance-filter-control">
          <span>{period.mode === "year" ? t("year") : t("month")}</span>
          <div className="month-stepper">
            <button
              className="button secondary month-step-button"
              type="button"
              aria-label={
                period.mode === "year" ? t("previousYear") : t("previousMonth")
              }
              title={
                period.mode === "year" ? t("previousYear") : t("previousMonth")
              }
              onClick={() =>
                setPeriod(
                  period.mode === "year"
                    ? { ...period, year: period.year - 1 }
                    : { ...period, month: shiftMonth(period.month, -1) },
                )
              }
            >
              {"‹"}
            </button>
            {period.mode === "year" ? (
              <input
                className="field"
                type="number"
                min="2000"
                max="2100"
                aria-label={t("year")}
                value={yearValid ? period.year : ""}
                onChange={(event) =>
                  setPeriod({ ...period, year: Number(event.target.value) })
                }
              />
            ) : (
              <input
                className="field"
                type="month"
                aria-label={t("month")}
                value={period.month}
                onChange={(event) =>
                  event.target.value &&
                  setPeriod({ ...period, month: event.target.value })
                }
              />
            )}
            <button
              className="button secondary month-step-button"
              type="button"
              aria-label={
                period.mode === "year" ? t("nextYear") : t("nextMonth")
              }
              title={period.mode === "year" ? t("nextYear") : t("nextMonth")}
              onClick={() =>
                setPeriod(
                  period.mode === "year"
                    ? { ...period, year: period.year + 1 }
                    : { ...period, month: shiftMonth(period.month, 1) },
                )
              }
            >
              {"›"}
            </button>
          </div>
        </div>
        {/* Always present, so the other filters keep their width without it. */}
        {exportUserId ? (
          <div className="finance-filter-control time-report-export">
            <span>{t("export")}</span>
            <ReportExportButtons
              endpoint="/api/time-reports/export"
              query={{
                userId: exportUserId,
                ...(period.mode === "month"
                  ? {
                      year: period.month.slice(0, 4),
                      month: String(Number(period.month.slice(5, 7))),
                    }
                  : { year: String(period.year) }),
              }}
              hints={{ xlsx: "exportExcelHint", pdf: "exportPdfHint" }}
              errorKey="timeReportExportFailed"
              disabled={!yearValid}
            />
          </div>
        ) : (
          <div className="time-report-export" aria-hidden="true" />
        )}
      </section>
      {dashboard && <ConsultantDashboard {...dashboard} period={period} />}
      {history && <HistoryView {...history} period={period} />}
    </>
  );
}
