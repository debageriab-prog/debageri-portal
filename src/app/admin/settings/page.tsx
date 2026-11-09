import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  invoiceSettingsFrom,
  missingInvoiceSettings,
} from "@/domain/finance/invoice-settings";
import { OrganizationTabs } from "./OrganizationTabs";
import { ORGANIZATION_TABS } from "./tabs";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const requestedTab = (await searchParams).tab;
  // Accounting emails moved to the email settings page.
  if (requestedTab === "accounting") {
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
    [t("invoiceSetting_plusgiro"), invoicing.plusgiro],
    [t("invoiceSetting_iban"), invoicing.iban],
    [t("invoiceSetting_bic"), invoicing.bic],
    [t("invoiceSetting_paymentTermsDays"), String(invoicing.paymentTermsDays)],
    [t("invoiceSetting_lateInterestText"), invoicing.lateInterestText],
    [t("invoiceSetting_defaultOurReference"), invoicing.defaultOurReference],
    [
      t("invoiceSetting_nextInvoiceNumber"),
      String(invoicing.nextInvoiceNumber),
    ],
    [
      t("invoiceSetting_nextCustomerNumber"),
      String(invoicing.nextCustomerNumber),
    ],
    [t("invoiceSetting_fSkatt"), invoicing.fSkatt ? t("yes") : t("no")],
    [t("invoiceSetting_ocrEnabled"), invoicing.ocrEnabled ? t("yes") : t("no")],
  ];
  const initialTab =
    ORGANIZATION_TABS.find((tab) => tab === requestedTab) ??
    ("general" as const);
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
      {!organization ? (
        <section className="card">
          <p>{t("organizationNotConfigured")}</p>
        </section>
      ) : (
        <OrganizationTabs
          initialTab={initialTab}
          panels={{
            general: (
              <dl className="detail-facts">
                {(
                  [
                    [t("organizationName"), String(organization.name)],
                    ["ID", snapshot.id],
                    [t("timezone"), String(organization.timezone ?? "")],
                    [t("locale"), String(organization.locale ?? "")],
                  ] as Array<[string, string]>
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value && value !== "undefined" ? value : "—"}</dd>
                  </div>
                ))}
              </dl>
            ),
            invoicing: (
              <div className="invoice-settings-summary">
                <div className="week-head">
                  <p className="muted">{t("invoiceSettingsEditDescription")}</p>
                  <Link
                    className="button secondary"
                    href="/admin/settings/edit"
                  >
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
              </div>
            ),
          }}
        />
      )}
    </>
  );
}
