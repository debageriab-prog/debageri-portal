"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

export function EmailTemplateForm({
  subject,
  template,
}: {
  subject: string;
  template: string;
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
    const response = await appCheckFetch("/api/admin/email-templates", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId: form.get("templateId"),
        subject: form.get("subject"),
        template: form.get("template"),
      }),
    });
    setBusy(false);
    if (!response.ok) return setError(t("emailTemplateSaveFailed"));
    setMessage(t("emailTemplateSaved"));
  }

  return (
    <form className="card reminder-settings-form" onSubmit={save}>
      <div className="form-grid">
        <label className="form-wide">
          {t("selectEmailTemplate")}
          <select
            className="field"
            name="templateId"
            defaultValue="time-report-reminder"
          >
            <option value="time-report-reminder">
              {t("timeReportReminderTemplate")}
            </option>
          </select>
        </label>
        <label className="form-wide">
          {t("emailSubject")}
          <input
            className="field"
            name="subject"
            defaultValue={subject}
            required
          />
        </label>
        <label className="form-wide">
          {t("emailTemplate")}
          <textarea
            className="field reminder-template"
            name="template"
            defaultValue={template}
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
