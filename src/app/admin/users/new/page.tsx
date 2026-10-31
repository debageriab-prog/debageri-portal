import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { EmployeeEditor } from "../EmployeeEditor";
import { financeEnabled } from "../user-data";

export default async function NewEmployeePage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const canManageCompensation = await financeEnabled(
    getAdminServices().db,
    actor.organizationId,
  );
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/users">
            ← {t("backToEmployees")}
          </Link>
          <h1>{t("addEmployee")}</h1>
          <p className="muted page-description">
            {t("addEmployeeDescription")}
          </p>
        </div>
      </div>
      <EmployeeEditor financeEnabled={canManageCompensation} />
    </>
  );
}
