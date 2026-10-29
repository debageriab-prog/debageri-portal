import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  isAccountingEmailConfigured,
  readAccountingContacts,
} from "@/server/services/accounting-email-service";
import { AccountingEmailsForm } from "./AccountingEmailsForm";
import { OrganizationTabs } from "./OrganizationTabs";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [snapshot, contacts, emailConfigured] = await Promise.all([
    db.collection("organizations").doc(user.organizationId).get(),
    readAccountingContacts(db, user.organizationId),
    isAccountingEmailConfigured(db, user.organizationId),
  ]);
  const organization = snapshot.data();
  const general = !organization ? (
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
  );
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
      <OrganizationTabs
        initialTab={
          (await searchParams).tab === "accounting" ? "accounting" : "general"
        }
        panels={{
          general,
          accounting: (
            <AccountingEmailsForm
              contacts={contacts}
              emailConfigured={emailConfigured}
            />
          ),
        }}
      />
    </>
  );
}
