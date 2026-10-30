import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  customEmailTemplate,
  defaultEmailTemplates,
  EMAIL_TEMPLATE_KINDS,
  NOTIFICATION_LOCALES,
  notificationSettingsFrom,
} from "@/domain/notifications";
import {
  defaultReminderSubject,
  defaultReminderTemplate,
} from "@/server/services/reminder-service";
import { EmailSettingsForm } from "./EmailSettingsForm";
import { EmailSettingsTabs, type EmailSettingsTab } from "./EmailSettingsTabs";
import {
  EmailTemplateForm,
  type NotificationTemplateState,
} from "./EmailTemplateForm";
import { NotificationSettingsForm } from "./NotificationSettingsForm";

const tabs: EmailSettingsTab[] = ["smtp", "notifications", "templates"];

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [settingsDoc, templatesDoc] = await Promise.all([
    db.collection("reminderSettings").doc(actor.organizationId).get(),
    db.collection("emailTemplates").doc(actor.organizationId).get(),
  ]);
  const data = settingsDoc.data();
  const templateData = templatesDoc.data()?.timeReportReminder;
  const stored = templatesDoc.data()?.notifications;
  const notificationTemplates = Object.fromEntries(
    EMAIL_TEMPLATE_KINDS.map((kind) => [
      kind,
      Object.fromEntries(
        NOTIFICATION_LOCALES.map((locale) => {
          const custom = customEmailTemplate(stored, kind, locale);
          const fallback = defaultEmailTemplates[locale][kind];
          return [
            locale,
            {
              subject: custom?.subject ?? fallback.subject,
              body: custom?.body ?? fallback.body,
              custom: Boolean(custom),
            },
          ];
        }),
      ),
    ]),
  ) as NotificationTemplateState;
  const requestedTab = (await searchParams).tab;
  const initialTab =
    tabs.find((tab) => tab === requestedTab) ?? ("smtp" as const);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("emailSettings")}</h1>
          <p className="muted page-description">
            {t("emailSettingsDescription")}
          </p>
        </div>
      </div>
      <EmailSettingsTabs
        initialTab={initialTab}
        panels={{
          smtp: (
            <EmailSettingsForm
              settings={{
                smtpHost: String(data?.smtpHost ?? ""),
                smtpPort: Number(data?.smtpPort ?? 587),
                smtpSecure: Boolean(data?.smtpSecure),
                smtpUsername: String(data?.smtpUsername ?? ""),
                passwordConfigured: Boolean(data?.encryptedPassword),
                fromEmail: String(data?.fromEmail ?? ""),
                senderName: String(data?.senderName ?? "Debageri"),
              }}
            />
          ),
          notifications: (
            <NotificationSettingsForm
              notifications={notificationSettingsFrom(data?.notifications)}
              emailConfigured={Boolean(data?.encryptedPassword)}
            />
          ),
          templates: (
            <>
              <p className="muted editor-panel-intro">
                {t("emailTemplatesDescription")}
              </p>
              <EmailTemplateForm
                subject={String(
                  templateData?.subject ??
                    data?.subject ??
                    defaultReminderSubject,
                )}
                template={String(
                  templateData?.template ??
                    data?.template ??
                    defaultReminderTemplate,
                )}
                notifications={notificationTemplates}
              />
            </>
          ),
        }}
      />
    </>
  );
}
