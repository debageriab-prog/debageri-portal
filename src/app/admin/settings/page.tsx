import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
export default async function SettingsPage() {
  const user = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("organizations")
    .doc(user.organizationId)
    .get();
  const organization = snapshot.data();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("organization")}</h1>
          <p className="muted page-description">
            {t("organizationPageDescription")}
          </p>
        </div>
      </div>
      <section className="card">
        {!organization ? (
          <p>{t("organizationNotConfigured")}</p>
        ) : (
          <>
            <h2>{String(organization.name)}</h2>
            <p>
              <strong>ID</strong>
              <br />
              {snapshot.id}
            </p>
            <p>
              <strong>{t("timezone")}</strong>
              <br />
              {String(organization.timezone)}
            </p>
            <p>
              <strong>{t("locale")}</strong>
              <br />
              {String(organization.locale)}
            </p>
          </>
        )}
      </section>
    </>
  );
}
