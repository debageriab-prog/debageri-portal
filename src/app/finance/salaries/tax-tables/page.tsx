import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { taxYears } from "@/server/services/tax-table-service";
import { TaxTableImport } from "./TaxTableImport";

export default async function TaxTablesPage() {
  const actor = (await verifySession())!;
  if (actor.role !== "admin") redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const years = await taxYears(db, actor.organizationId);
  const currentYear = Number(stockholmDateTime().date.slice(0, 4));
  return (
    <>
      <div className="topbar">
        <div>
          <h1>{t("taxTablesTitle")}</h1>
          <p className="muted page-description">{t("taxTablesDescription")}</p>
        </div>
      </div>
      <TaxTableImport years={years} currentYear={currentYear} />
    </>
  );
}
