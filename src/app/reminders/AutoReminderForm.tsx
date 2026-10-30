"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  AUTO_REMINDER_KINDS,
  type AutoReminderSettings,
} from "@/domain/reminders/schedule";

export function AutoReminderForm({
  autoReminders,
  settingsConfigured,
}: {
  autoReminders: AutoReminderSettings;
  settingsConfigured: boolean;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await appCheckFetch("/api/reminders/auto", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        autoReminders: Object.fromEntries(
          AUTO_REMINDER_KINDS.map((kind) => [kind, form.get(kind) === "on"]),
        ),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(t("autoReminderSaveFailed"));
    setMessage(t("autoReminderSaved"));
  }

  return (
    <form className="reminder-settings-form" onSubmit={save}>
      <p className="muted">{t("autoReminderDescription")}</p>
      {!settingsConfigured && (
        <p className="notice notice-warning">{t("reminderSettingsMissing")}</p>
      )}
      <fieldset className="access-section">
        <legend>{t("remindersTab_auto")}</legend>
        {AUTO_REMINDER_KINDS.map((kind) => (
          <label className="checkbox-row" key={kind}>
            <input
              name={kind}
              type="checkbox"
              defaultChecked={autoReminders[kind]}
            />
            <span>{t(`autoReminder_${kind}`)}</span>
            <InfoTip text={t(`autoReminderHelp_${kind}`)} />
          </label>
        ))}
      </fieldset>
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <button className="button" disabled={busy}>
        {busy ? t("saving") : t("saveSettings")}
      </button>
    </form>
  );
}
