import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  invoiceSettingsFrom,
  missingInvoiceSettings,
} from "@/domain/finance/invoice-settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Accounting emails moved to the email settings page.
  if ((await searchParams).tab === "accounting") {
    redirect("/admin/email-settings?tab=accounting");
  }
  const user = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("organizations")
    .doc(user.organizationId)
    .get();
  const organization = snapshot.data();
  const invoicing = invoiceSettingsFrom(
    organization?.invoicing,
    String(organization?.name ?? ""),
  );
  const missing = missingInvoiceSettings(invoicing);
  const address = [
    invoicing.addressLine,
    [invoicing.postalCode, invoicing.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const rows: Array<[string, string]> = [
    [t("invoiceSetting_legalName"), invoicing.legalName],
    [t("invoiceSetting_orgNumber"), invoicing.orgNumber],
    [t("invoiceSetting_vatNumber"), invoicing.vatNumber],
    [t("invoiceSettingsAddress"), address],
    [t("invoiceSetting_phone"), invoicing.phone],
    [t("invoiceSetting_email"), invoicing.email],
    [t("invoiceSetting_bankgiro"), invoicing.bankgiro],
    [t("invoiceSetting_paymentTermsDays"), String(invoicing.paymentTermsDays)],
    [
      t("invoiceSetting_nextInvoiceNumber"),
      String(invoicing.nextInvoiceNumber),
    ],
    [t("invoiceSetting_fSkatt"), invoicing.fSkatt ? t("yes") : t("no")],
  ];
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
      {organization && (
        <section className="card">
          <div className="week-head">
            <h2>{t("invoiceSettingsTitle")}</h2>
            <Link className="button secondary" href="/admin/settings/edit">
              {t("invoiceSettingsEdit")}
            </Link>
          </div>
          {missing.length > 0 && (
            <p className="notice notice-warning">
              {t("invoiceSettingsIncomplete")}
            </p>
          )}
          <dl className="detail-facts">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
