import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import { EmailSettingsForm } from "./EmailSettingsForm";

export default async function EmailSettingsPage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const data = (
    await db.collection("reminderSettings").doc(actor.organizationId).get()
  ).data();
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
    </>
  );
}
