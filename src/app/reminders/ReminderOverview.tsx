"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  formatMissingWeek,
  type MissingWeek,
} from "@/domain/reminders/missing-weeks";
import { ReminderPanel } from "./ReminderPanel";
import { sendReminders } from "./send-reminders";

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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<ReminderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: string; text: string } | null>(
    null,
  );
  const query = search.trim().toLocaleLowerCase();
  const visible = rows.filter((row) =>
    row.displayName.toLocaleLowerCase().includes(query),
  );
  const reviewing = rows.find((row) => row.id === reviewingId);
  const canRemind = (row: ReminderRow) =>
    settingsConfigured && row.missing.length > 0 && !row.alreadySentToday;
  const visibleRemindable = visible.filter(canRemind);
  const selectedRows = rows.filter(
    (row) => selected.has(row.id) && canRemind(row),
  );
  const allVisibleSelected =
    visibleRemindable.length > 0 &&
    visibleRemindable.every((row) => selected.has(row.id));

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
  const blockedReason = (row: ReminderRow) => {
    if (!settingsConfigured) return t("reminderSettingsMissing");
    if (!row.missing.length) return t("noMissingWeeks");
    return row.alreadySentToday ? t("reminderAlreadySent") : undefined;
  };

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visibleRemindable) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  async function remind() {
    if (!confirming) return;
    setBusy(true);
    setNotice(null);
    const result = await sendReminders(confirming.map((row) => row.id));
    setBusy(false);
    setConfirming(null);
    setSelected(new Set());
    const summary = t("remindersSentSummary")
      .replace("{sent}", String(result.sent))
      .replace("{skipped}", String(result.skipped))
      .replace("{failed}", String(result.failed));
    setNotice(
      result.failed
        ? {
            kind: "notice-error",
            text: `${summary} ${result.error || t("reminderSendFailed")}`,
          }
        : {
            kind: result.sent ? "notice-success" : "notice-warning",
            text: summary,
          },
    );
    router.refresh();
  }

  return (
    <>
      {!settingsConfigured && (
        <p className="notice notice-warning">{t("reminderSettingsMissing")}</p>
      )}
      <div className="reminder-toolbar">
        <label>
          {t("searchConsultant")}
          <input
            className="field"
            type="search"
            value={search}
            placeholder={t("searchConsultantPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={!selectedRows.length}
          onClick={() => setConfirming(selectedRows)}
        >
          {t("remindSelected").replace("{count}", String(selectedRows.length))}
        </button>
      </div>
      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
      {visible.length === 0 ? (
        <p className="muted">{t("noReminderConsultants")}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={!visibleRemindable.length}
                      onChange={(event) => toggleAll(event.target.checked)}
                    />
                    <span>{t("selectAll")}</span>
                  </label>
                </th>
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
                  <td>
                    <input
                      type="checkbox"
                      aria-label={row.displayName}
                      title={blockedReason(row)}
                      checked={selected.has(row.id) && canRemind(row)}
                      disabled={!canRemind(row)}
                      onChange={(event) => toggle(row.id, event.target.checked)}
                    />
                  </td>
                  <td>{row.displayName}</td>
                  <td>{row.missing.length}</td>
                  <td>{reportText(row)}</td>
                  <td>{reminderText(row)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setReviewingId(row.id)}
                      >
                        {t("review")}
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        title={blockedReason(row)}
                        disabled={!canRemind(row)}
                        onClick={() => setConfirming([row])}
                      >
                        {t("remindNow")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remind-now-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("reminders")}</span>
                <h2 id="remind-now-title">{t("remindNowConfirm")}</h2>
              </div>
            </header>
            <ul className="reporting-day-list">
              {confirming.map((row) => (
                <li key={row.id}>{row.displayName}</li>
              ))}
            </ul>
            <footer className="modal-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                {t("no")}
              </button>
              <button className="button" disabled={busy} onClick={remind}>
                {busy ? t("sendingReminder") : t("yes")}
              </button>
            </footer>
          </section>
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
