"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

type Settings = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  passwordConfigured: boolean;
  fromEmail: string;
  senderName: string;
  subject: string;
  template: string;
};

export function ReminderSettingsForm({ settings }: { settings: Settings }) {
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
    const response = await appCheckFetch("/api/reminders/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        smtpHost: form.get("smtpHost"),
        smtpPort: Number(form.get("smtpPort")),
        smtpSecure: form.get("smtpSecure") === "on",
        smtpUsername: form.get("smtpUsername"),
        password: form.get("password") || undefined,
        fromEmail: form.get("fromEmail"),
        senderName: form.get("senderName"),
        subject: form.get("subject"),
        template: form.get("template"),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) return setError(result.error ?? t("settingsSaveFailed"));
    setMessage(t("settingsSaved"));
  }

  return (
    <form className="card reminder-settings-form" onSubmit={save}>
      <div className="form-grid">
        <label>
          {t("smtpHost")}
          <input
            className="field"
            name="smtpHost"
            defaultValue={settings.smtpHost}
            required
          />
        </label>
        <label>
          {t("smtpPort")}
          <input
            className="field"
            name="smtpPort"
            type="number"
            min="1"
            max="65535"
            defaultValue={settings.smtpPort}
            required
          />
        </label>
        <label>
          {t("smtpUsername")}
          <input
            className="field"
            name="smtpUsername"
            defaultValue={settings.smtpUsername}
            required
          />
        </label>
        <label>
          {t("senderPassword")}
          <input
            className="field"
            name="password"
            type="password"
            placeholder={
              settings.passwordConfigured ? t("leaveBlankPassword") : ""
            }
            required={!settings.passwordConfigured}
          />
        </label>
        <label>
          {t("fromEmail")}
          <input
            className="field"
            name="fromEmail"
            type="email"
            defaultValue={settings.fromEmail}
            required
          />
        </label>
        <label>
          {t("senderName")}
          <input
            className="field"
            name="senderName"
            defaultValue={settings.senderName}
            required
          />
        </label>
        <label className="checkbox-row form-wide">
          <input
            name="smtpSecure"
            type="checkbox"
            defaultChecked={settings.smtpSecure}
          />
          <span>{t("smtpSecure")}</span>
        </label>
        <label className="form-wide">
          {t("emailSubject")}
          <input
            className="field"
            name="subject"
            defaultValue={settings.subject}
            required
          />
        </label>
        <label className="form-wide">
          {t("emailTemplate")}
          <textarea
            className="field reminder-template"
            name="template"
            defaultValue={settings.template}
            rows={12}
            required
          />
          <small>{t("templatePlaceholders")}</small>
        </label>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <button className="button" disabled={busy}>
        {busy ? t("saving") : t("saveSettings")}
      </button>
    </form>
  );
}
