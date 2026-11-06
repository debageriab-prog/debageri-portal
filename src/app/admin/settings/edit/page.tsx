import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import { InvoiceSettingsForm } from "../InvoiceSettingsForm";

export default async function EditOrganizationPage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const organization = (
    await getAdminServices()
      .db.collection("organizations")
      .doc(actor.organizationId)
      .get()
  ).data();
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/settings">
            ← {t("organization")}
          </Link>
          <h1>{t("invoiceSettingsEditTitle")}</h1>
          <p className="muted page-description">
            {t("invoiceSettingsEditDescription")}
          </p>
        </div>
      </div>
      <InvoiceSettingsForm
        settings={invoiceSettingsFrom(
          organization?.invoicing,
          String(organization?.name ?? ""),
        )}
      />
    </>
  );
}
