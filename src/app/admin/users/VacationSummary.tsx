"use client";

import { useCallback, useEffect, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { Locale } from "@/lib/localization/locale";
import { minutesToDays } from "@/domain/vacation/periods";
import type { VacationSummary } from "@/server/services/vacation-service";

export function formatDays(minutes: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    minutesToDays(minutes),
  );
}

export function formatPercentFromBps(bps: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    bps / 100,
  );
}

/** Loads an employee's vacation summary; `reload` fetches it again. */
export function useVacationSummary(userId: string | null) {
  const [summary, setSummary] = useState<VacationSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(userId));
  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(userId)}/vacation`,
      );
      const result = (await response.json().catch(() => ({}))) as
        VacationSummary | { error?: string };
      if (!response.ok || "error" in result) {
        setSummary(null);
        setError(("error" in result && result.error) || "serverError");
        return;
      }
      setSummary(result as VacationSummary);
    } catch {
      setError("serverError");
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    // Fetching on mount; the state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { summary, error, loading, reload };
}

/** Normal, saved, advance and used days as metric tiles. */
export function VacationBalanceTiles({
  summary,
  compact = false,
}: {
  summary: VacationSummary;
  compact?: boolean;
}) {
  const { t, locale } = useLocale();
  const { balance, period } = summary;
  const normalOf =
    period.grantedMinutes +
    summary.adjustments
      .filter((item) => item.periodId === period.id && item.bucket === "normal")
      .reduce((sum, item) => sum + item.deltaMinutes, 0);
  const tiles = compact
    ? [
        {
          label: t("vacationNormalLeft"),
          value: formatDays(balance.normal + balance.saved, locale),
          hint: t("vacationInclSaved").replace(
            "{days}",
            formatDays(balance.saved, locale),
          ),
        },
        {
          label: t("vacationAdvanceLeft"),
          value: formatDays(balance.advance, locale),
          hint: t("vacationNoSupplement"),
        },
        {
          label: t("vacationNextRenewal"),
          value: summary.nextRenewal?.date ?? "—",
          hint: summary.nextRenewal
            ? t("vacationAboutDays").replace(
                "{days}",
                formatDays(summary.nextRenewal.estimatedMinutes, locale),
              )
            : t("vacationNoRenewal"),
        },
      ]
    : [
        {
          label: t("vacationNormalLeft"),
          value: formatDays(balance.normal, locale),
          hint: t("vacationOfDays").replace(
            "{days}",
            formatDays(normalOf, locale),
          ),
        },
        {
          label: t("vacationSavedDays"),
          value: formatDays(balance.saved, locale),
          hint: t("vacationSavedHint"),
        },
        {
          label: t("vacationAdvanceLeft"),
          value: formatDays(balance.advance, locale),
          hint: t("vacationNoSupplement"),
        },
        {
          label: t("vacationUsedThisPeriod"),
          value: formatDays(balance.used, locale),
          hint: t("vacationFromApprovedReports"),
        },
      ];
  return (
    <>
      <div className="metrics vacation-metrics">
        {tiles.map((tile) => (
          <div className="metric" key={tile.label}>
            <span className="muted">{tile.label}</span>
            <strong>{tile.value}</strong>
            <small className="muted">{tile.hint}</small>
          </div>
        ))}
      </div>
      {balance.overdrawn && (
        <p className="notice notice-warning">{t("vacationOverdrawn")}</p>
      )}
    </>
  );
}
