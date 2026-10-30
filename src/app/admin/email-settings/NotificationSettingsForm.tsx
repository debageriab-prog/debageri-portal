"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  NOTIFICATION_TOPICS,
  type NotificationSettings,
} from "@/domain/notifications";

export function NotificationSettingsForm({
  notifications,
  emailConfigured,
}: {
  notifications: NotificationSettings;
  emailConfigured: boolean;
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
    const response = await appCheckFetch("/api/admin/email-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notifications: Object.fromEntries(
          NOTIFICATION_TOPICS.map((topic) => [
            topic,
            form.get(`notify-${topic}`) === "on",
          ]),
        ),
      }),
    });
    setBusy(false);
    if (!response.ok) return setError(t("emailSettingsSaveFailed"));
    setMessage(t("emailSettingsSaved"));
  }

  return (
    <form className="reminder-settings-form" onSubmit={save}>
      <p className="muted">{t("notificationEmailsHelp")}</p>
      {!emailConfigured && (
        <p className="notice notice-warning">{t("notificationEmailsNoSmtp")}</p>
      )}
      <fieldset className="access-section">
        <legend>{t("notificationEmails")}</legend>
        {NOTIFICATION_TOPICS.map((topic) => (
          <label className="checkbox-row" key={topic}>
            <input
              name={`notify-${topic}`}
              type="checkbox"
              defaultChecked={notifications[topic]}
            />
            <span>{t(`notificationTopic_${topic}`)}</span>
            <InfoTip text={t(`notificationTopicHelp_${topic}`)} />
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
