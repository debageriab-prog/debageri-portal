"use client";

import { FormEvent, useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  ACCOUNTING_EMAIL_KINDS,
  defaultEmailTemplates,
  EMAIL_NOTIFICATION_KINDS,
  emailPlaceholders,
  NOTIFICATION_LOCALES,
  type AccountingEmailKind,
  type EmailTemplateKind,
  type NotificationLocale,
} from "@/domain/notifications";

type TemplateText = { subject: string; body: string; custom: boolean };
export type NotificationTemplateState = Record<
  EmailTemplateKind,
  Record<NotificationLocale, TemplateText>
>;
type TemplateId = "time-report-reminder" | EmailTemplateKind;

export function EmailTemplateForm({
  subject,
  template,
  notifications,
}: {
  subject: string;
  template: string;
  notifications: NotificationTemplateState;
}) {
  const { t, locale: uiLocale } = useLocale();
  const [templateId, setTemplateId] = useState<TemplateId>(
    "time-report-reminder",
  );
  const [language, setLanguage] = useState<NotificationLocale>(
    uiLocale === "sv-SE" ? "sv-SE" : "en-SE",
  );
  const [reminder, setReminder] = useState({ subject, body: template });
  const [saved, setSaved] = useState(notifications);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isReminder = templateId === "time-report-reminder";
  const current = isReminder
    ? { ...reminder, custom: true }
    : saved[templateId][language];
  const formKey = isReminder ? templateId : `${templateId}-${language}`;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    const response = await appCheckFetch("/api/admin/email-templates", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(t("emailTemplateSaveFailed"));
      return false;
    }
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      subject: String(form.get("subject") ?? ""),
      body: String(form.get("template") ?? ""),
    };
    const ok = await send({
      templateId,
      ...(isReminder ? {} : { locale: language }),
      subject: next.subject,
      template: next.body,
    });
    if (!ok) return;
    if (isReminder) setReminder(next);
    else
      setSaved((all) => ({
        ...all,
        [templateId]: {
          ...all[templateId],
          [language]: { ...next, custom: true },
        },
      }));
    setMessage(t("emailTemplateSaved"));
  }

  async function reset() {
    if (isReminder) return;
    const ok = await send({ templateId, locale: language, reset: true });
    if (!ok) return;
    setSaved((all) => ({
      ...all,
      [templateId]: {
        ...all[templateId],
        [language]: {
          ...defaultEmailTemplates[language][templateId],
          custom: false,
        },
      },
    }));
    setMessage(t("emailTemplateResetDone"));
  }

  return (
    <form className="card reminder-settings-form" onSubmit={save}>
      <div className="form-grid">
        <label className={isReminder ? "form-wide" : undefined}>
          {t("selectEmailTemplate")}
          <select
            className="field"
            name="templateId"
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value as TemplateId);
              setMessage("");
              setError("");
            }}
          >
            <option value="time-report-reminder">
              {t("timeReportReminderTemplate")}
            </option>
            {EMAIL_NOTIFICATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`emailTemplate_${kind}`)}
              </option>
            ))}
            <optgroup label={t("accountingEmailTemplates")}>
              {ACCOUNTING_EMAIL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`emailTemplate_${kind}`)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {!isReminder && (
          <label>
            {t("emailTemplateLanguage")}
            <select
              className="field"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value as NotificationLocale);
                setMessage("");
                setError("");
              }}
            >
              {NOTIFICATION_LOCALES.map((item) => (
                <option key={item} value={item}>
                  {item === "sv-SE" ? "Svenska" : "English"}
                </option>
              ))}
            </select>
            <small>{t("emailTemplateLanguageHelp")}</small>
          </label>
        )}
        <label className="form-wide" key={`subject-${formKey}`}>
          {t("emailSubject")}
          <input
            className="field"
            name="subject"
            defaultValue={current.subject}
            maxLength={200}
            required
          />
        </label>
        <label className="form-wide" key={`body-${formKey}`}>
          {t("emailTemplate")}
          <textarea
            className="field reminder-template"
            name="template"
            defaultValue={current.body}
            rows={12}
            maxLength={10000}
            required
          />
          <small>
            {isReminder
              ? t("templatePlaceholders")
              : t(
                  ACCOUNTING_EMAIL_KINDS.includes(
                    templateId as AccountingEmailKind,
                  )
                    ? "accountingTemplatePlaceholders"
                    : "notificationTemplatePlaceholders",
                ).replace(
                  "{placeholders}",
                  emailPlaceholders[templateId]
                    .map((name) => `{{${name}}}`)
                    .join(", "),
                )}
          </small>
          {!isReminder && (
            <small>
              {current.custom
                ? t("emailTemplateCustomized")
                : t("emailTemplateUsingDefault")}
            </small>
          )}
        </label>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <div className="actions">
        <button className="button" disabled={busy}>
          {busy ? t("saving") : t("saveSettings")}
        </button>
        {!isReminder && current.custom && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void reset()}
          >
            {t("resetToDefault")}
          </button>
        )}
      </div>
    </form>
  );
}
