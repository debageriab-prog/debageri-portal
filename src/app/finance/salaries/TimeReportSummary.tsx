"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import { formatDuration } from "@/lib/durations/duration";
import type { SalaryTimeGroup, SalaryTimeSummary } from "./salary-data";

type Translate = ReturnType<typeof useLocale>["t"];
type MessageKey = Parameters<Translate>[0];

/** Approved and not yet approved time of the event period, in one glance. */
export function TimeReportSummary({ summary }: { summary: SalaryTimeSummary }) {
  const { t, locale } = useLocale();
  if (!summary.approved.minutes && !summary.notApproved.minutes) return null;
  const hours = (minutes: number) =>
    minutes ? formatDuration(minutes, locale) : "0 h";

  const group = (
    label: string,
    value: SalaryTimeGroup,
    tone: "approved" | "pending",
    extra?: string,
  ) => (
    <div className={`salary-time-group salary-time-${tone}`}>
      <span className="salary-time-label">{label}</span>
      <strong>{hours(value.minutes)}</strong>
      {extra && <span className="muted">{extra}</span>}
      {value.categories.length > 0 && (
        <span className="salary-time-categories">
          {value.categories
            .map(
              (item) =>
                `${t(`salaryTimeCategory_${item.category}` as MessageKey)} ${hours(item.minutes)}`,
            )
            .join(" · ")}
        </span>
      )}
    </div>
  );

  return (
    <div className="salary-time-summary">
      {group(t("salaryTimeApproved"), summary.approved, "approved")}
      {summary.notApproved.minutes > 0 && (
        <>
          {group(
            t("salaryTimeNotApproved"),
            summary.notApproved,
            "pending",
            t("salaryTimeWeeks").replace(
              "{weeks}",
              String(summary.notApproved.weeks),
            ),
          )}
          <InfoTip text={t("salaryTimeNotApprovedTip")} />
        </>
      )}
    </div>
  );
}
