import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  defaultReminderSubject,
  defaultReminderTemplate,
} from "@/server/services/reminder-service";
import { ReminderSettingsForm } from "./ReminderSettingsForm";

export default async function ReminderSettingsPage() {
  const actor = (await verifySession())!;
  if (actor.role !== "admin") redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const doc = await db
    .collection("reminderSettings")
    .doc(actor.organizationId)
    .get();
  const data = doc.data();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("reminders")}</div>
          <h1>{t("reminderSettings")}</h1>
          <p className="muted page-description">
            {t("reminderSettingsDescription")}
          </p>
        </div>
      </div>
      <ReminderSettingsForm
        settings={{
          smtpHost: String(data?.smtpHost ?? ""),
          smtpPort: Number(data?.smtpPort ?? 587),
          smtpSecure: Boolean(data?.smtpSecure),
          smtpUsername: String(data?.smtpUsername ?? ""),
          passwordConfigured: Boolean(data?.encryptedPassword),
          fromEmail: String(data?.fromEmail ?? ""),
          senderName: String(data?.senderName ?? "Debageri"),
          subject: String(data?.subject ?? defaultReminderSubject),
          template: String(data?.template ?? defaultReminderTemplate),
        }}
      />
    </>
  );
}
