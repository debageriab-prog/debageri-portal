import "server-only";

import {
  withExtraUsage,
  type VacationBalance,
} from "@/domain/vacation/balance";
import { minutesToDays } from "@/domain/vacation/periods";
import { getServerLocale, getTranslator } from "@/lib/localization/server";
import type { VacationSummary } from "@/server/services/vacation-service";

type Overview = Omit<VacationSummary, "adjustments">;

/** Minutes of vacation among time entries, by their time-code snapshot. */
export function vacationMinutesIn(
  entries: Array<{
    minutes?: unknown;
    timeCodeSnapshot?: { category?: unknown };
  }>,
) {
  return entries
    .filter((entry) => entry.timeCodeSnapshot?.category === "vacation")
    .reduce((sum, entry) => sum + Number(entry.minutes ?? 0), 0);
}

/**
 * Vacation left for the person reporting time (`own`) or for someone
 * reviewing a report (`review`), where `reportMinutes` is the vacation in
 * that report and the card shows what is left once it is approved.
 */
export async function VacationOverviewCard({
  overview,
  mode,
  reportMinutes = 0,
  reportApproved = false,
}: {
  overview: Overview;
  mode: "own" | "review";
  reportMinutes?: number;
  /** The report is already counted in the balance. */
  reportApproved?: boolean;
}) {
  const t = await getTranslator();
  const locale = await getServerLocale();
  const days = (minutes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      minutesToDays(minutes),
    );
  const { balance, period, pendingMinutes, nextRenewal } = overview;
  const normal = (value: VacationBalance) => value.normal + value.saved;
  const tiles: Array<{ label: string; value: string; hint: string }> = [
    {
      label: t("vacationNormalLeft"),
      value: days(normal(balance)),
      hint: t("vacationInclSaved").replace("{days}", days(balance.saved)),
    },
    {
      label: t("vacationAdvanceLeft"),
      value: days(balance.advance),
      hint: t("vacationNoSupplement"),
    },
  ];
  let after: VacationBalance | null = null;
  if (mode === "own") {
    tiles.push({
      label: t("vacationPending"),
      value: days(pendingMinutes),
      hint: t("vacationPendingHint"),
    });
  } else if (reportMinutes > 0 && !reportApproved) {
    after = withExtraUsage(balance, reportMinutes);
    tiles.push({
      label: t("vacationAfterApproval"),
      value: days(normal(after)),
      hint: t("vacationAfterApprovalHint").replace(
        "{days}",
        days(after.advance),
      ),
    });
  }
  tiles.push({
    label: t("vacationNextRenewal"),
    value: nextRenewal?.date ?? "—",
    hint: nextRenewal
      ? t("vacationAboutDays").replace(
          "{days}",
          days(nextRenewal.estimatedMinutes),
        )
      : t("vacationNoRenewal"),
  });
  return (
    <section className="card vacation-overview">
      <h2>
        {mode === "own" ? t("vacationYours") : t("vacation")}
        <span className="muted">
          {" "}
          · {period.start} – {period.end}
        </span>
      </h2>
      {mode === "review" && reportMinutes > 0 && (
        <p className="notice">
          {t("vacationInThisReport").replace("{days}", days(reportMinutes))}
        </p>
      )}
      <div className="metrics vacation-metrics">
        {tiles.map((tile) => (
          <div className="metric" key={tile.label}>
            <span className="muted">{tile.label}</span>
            <strong>{tile.value}</strong>
            <small className="muted">{tile.hint}</small>
          </div>
        ))}
      </div>
      {(after ?? balance).overdrawn && (
        <p className="notice notice-error">
          {mode === "own"
            ? t("vacationOverdrawnOwn")
            : t("vacationOverdrawnReview")}
        </p>
      )}
    </section>
  );
}
