import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  defaultReminderSubject,
  defaultReminderTemplate,
} from "@/server/services/reminder-service";
import { EmailTemplateForm } from "./EmailTemplateForm";

export default async function EmailTemplatesPage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [templatesDoc, legacyDoc] = await Promise.all([
    db.collection("emailTemplates").doc(actor.organizationId).get(),
    db.collection("reminderSettings").doc(actor.organizationId).get(),
  ]);
  const templateData = templatesDoc.data()?.timeReportReminder;
  const legacyData = legacyDoc.data();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("emailTemplates")}</h1>
          <p className="muted page-description">
            {t("emailTemplatesDescription")}
          </p>
        </div>
      </div>
      <EmailTemplateForm
        subject={String(
          templateData?.subject ??
            legacyData?.subject ??
            defaultReminderSubject,
        )}
        template={String(
          templateData?.template ??
            legacyData?.template ??
            defaultReminderTemplate,
        )}
      />
    </>
  );
}
