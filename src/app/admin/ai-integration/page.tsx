import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import { readAiSettings } from "@/server/services/ai-service";
import { AiIntegrationForm } from "./AiIntegrationForm";

export default async function AiIntegrationPage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { settings, keyConfigured } = await readAiSettings(
    getAdminServices().db,
    actor.organizationId,
  );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("aiIntegration")}</h1>
          <p className="muted page-description">
            {t("aiIntegrationDescription")}
          </p>
        </div>
      </div>
      <AiIntegrationForm settings={settings} keyConfigured={keyConfigured} />
    </>
  );
}
