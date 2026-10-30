"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  formatMissingWeek,
  type MissingWeek,
} from "@/domain/reminders/missing-weeks";
import { ReminderPanel } from "./ReminderPanel";

export type ReminderRow = {
  id: string;
  displayName: string;
  email: string;
  missing: MissingWeek[];
  latestReport: { isoYear: number; isoWeek: number; status: string } | null;
  latestReminder: { sentDate: string; sentByRole: string } | null;
  alreadySentToday: boolean;
};

export function ReminderOverview({
  rows,
  settingsConfigured,
}: {
  rows: ReminderRow[];
  settingsConfigured: boolean;
}) {
  const { t } = useLocale();
  const [consultantFilter, setConsultantFilter] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const visible = rows.filter(
    (row) => !consultantFilter || row.id === consultantFilter,
  );
  const reviewing = rows.find((row) => row.id === reviewingId);

  const reportText = (row: ReminderRow) =>
    row.latestReport
      ? `${formatMissingWeek(row.latestReport)} (${row.latestReport.status})`
      : t("noReports");
  const reminderText = (row: ReminderRow) =>
    row.latestReminder
      ? `${row.latestReminder.sentDate} (${
          row.latestReminder.sentByRole === "system"
            ? t("automaticReminder")
            : row.latestReminder.sentByRole
        })`
      : t("never");

  return (
    <>
      <div className="reminder-selection">
        <label>
          {t("filterConsultant")}
          <select
            className="field"
            value={consultantFilter}
            onChange={(event) => setConsultantFilter(event.target.value)}
          >
            <option value="">{t("allConsultants")}</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="muted">{t("noReminderConsultants")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("consultant")}</th>
                <th>{t("missingWeeks")}</th>
                <th>{t("latestReport")}</th>
                <th>{t("latestReminder")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName}</td>
                  <td>{row.missing.length}</td>
                  <td>{reportText(row)}</td>
                  <td>{reminderText(row)}</td>
                  <td>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setReviewingId(row.id)}
                    >
                      {t("review")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-review-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("missingWeeks")}</span>
                <h2 id="reminder-review-title">{reviewing.displayName}</h2>
                <p>{reviewing.email}</p>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setReviewingId(null)}
              >
                ×
              </button>
            </header>
            <p>
              <strong>{t("latestReport")}:</strong> {reportText(reviewing)}
            </p>
            <p>
              <strong>{t("latestReminder")}:</strong> {reminderText(reviewing)}
            </p>
            {reviewing.missing.length ? (
              <ul className="reporting-day-list">
                {reviewing.missing.map((week) => (
                  <li key={formatMissingWeek(week)}>
                    {formatMissingWeek(week)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("noMissingWeeks")}</p>
            )}
            <ReminderPanel
              key={reviewing.id}
              selectedUserId={reviewing.id}
              settingsConfigured={settingsConfigured}
              alreadySentToday={reviewing.alreadySentToday}
              nothingMissing={!reviewing.missing.length}
            />
          </section>
        </div>
      )}
    </>
  );
}
