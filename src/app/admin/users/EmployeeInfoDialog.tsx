"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import { compensationModelLabels } from "@/domain/finance/compensation";
import type { ManagedUser } from "./UserManagement";
import {
  formatPercentFromBps,
  useVacationSummary,
  VacationBalanceTiles,
} from "./VacationSummary";

export function EmployeeInfoDialog({
  user,
  close,
}: {
  user: ManagedUser;
  close(): void;
}) {
  const { t, locale } = useLocale();
  const tracked = user.role !== "admin" && Boolean(user.vacation);
  const { summary, error, loading } = useVacationSummary(
    tracked ? user.id : null,
  );
  const rows: [string, string][] = [
    [t("employmentStartDate"), user.employmentStartDate || "—"],
    ...(user.employmentEndDate
      ? [[t("employmentEndDate"), user.employmentEndDate] as [string, string]]
      : []),
    [t("reportsTime"), user.reportsTime ? t("yes") : t("no")],
    [t("accessProfile"), user.accessProfileName ?? "—"],
    ...(user.compensationModel
      ? [
          [
            t("compensationModel"),
            t(compensationModelLabels[user.compensationModel]),
          ] as [string, string],
        ]
      : []),
  ];
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <section
        className="modal employee-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="employee-info-title">
              {user.displayName}{" "}
              <span className={`status status-${user.status}`}>
                {user.status === "active" ? t("active") : t("inactive")}
              </span>
            </h2>
            <p>
              <span className="capitalize">{user.role}</span> · {user.email} ·{" "}
              {user.employeeNumber}
            </p>
          </div>
          <button
            aria-label={t("close")}
            className="modal-close"
            type="button"
            onClick={close}
          >
            ×
          </button>
        </header>
        <h3>{t("employeeTab_employment")}</h3>
        <dl className="employee-info-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {user.role !== "admin" && (
          <>
            <h3>
              {t("employeeTab_vacation")}
              {summary && (
                <span className="muted">
                  {" "}
                  · {summary.period.start} – {summary.period.end}
                </span>
              )}
            </h3>
            {!tracked && <p className="muted">{t("vacationNotTracked")}</p>}
            {tracked && loading && !summary && (
              <p className="muted">{t("loading")}</p>
            )}
            {error && (
              <p className="notice notice-error">{t("vacationLoadFailed")}</p>
            )}
            {summary && (
              <>
                <VacationBalanceTiles summary={summary} compact />
                <p className="muted">
                  {t("vacationSettingsLine")
                    .replace("{days}", String(summary.settings.daysPerYear))
                    .replace(
                      "{percent}",
                      formatPercentFromBps(
                        summary.settings.supplementBps,
                        locale,
                      ),
                    )}
                </p>
              </>
            )}
          </>
        )}
        <footer className="modal-actions">
          <Link
            className="button secondary"
            href={`/admin/users/${encodeURIComponent(user.id)}/edit${tracked ? "?tab=vacation" : ""}`}
          >
            {t("edit")}
          </Link>
        </footer>
      </section>
    </div>
  );
}
