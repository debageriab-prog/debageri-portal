import Link from "next/link";
import { getTranslator } from "@/lib/localization/server";
import { EmployeeEditor } from "../EmployeeEditor";

export default async function NewEmployeePage() {
  const t = await getTranslator();
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
      <EmployeeEditor />
    </>
  );
}
