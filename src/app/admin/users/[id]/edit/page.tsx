import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { listAccessProfiles } from "@/server/services/access-profile-service";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { loadPayrollProfile } from "@/server/services/payroll-service";
import { municipalitiesFor } from "@/server/services/tax-table-service";
import { EmployeeEditor } from "../../EmployeeEditor";
import {
  compensationHistory,
  financeEnabled,
  toManagedUser,
} from "../../user-data";

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; compensationFailed?: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const { tab, compensationFailed } = await searchParams;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const snapshot = await db.collection("users").doc(id).get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    notFound();
  const employee = toManagedUser(snapshot);
  const [canManageCompensation, agreements, accessProfiles, payroll, rates] =
    await Promise.all([
      financeEnabled(db, actor.organizationId),
      compensationHistory(db, actor.organizationId, id),
      listAccessProfiles(db, actor.organizationId),
      loadPayrollProfile(db, actor.organizationId, id),
      municipalitiesFor(
        db,
        actor.organizationId,
        Number(stockholmDateTime().date.slice(0, 4)),
      ),
    ]);
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/users">
            ← {t("backToEmployees")}
          </Link>
          <h1>{employee.displayName}</h1>
          <p className="muted page-description">
            {t("editEmployeeDescription")}
          </p>
        </div>
      </div>
      <EmployeeEditor
        employee={employee}
        isSelf={employee.id === actor.id}
        financeEnabled={canManageCompensation}
        accessProfiles={accessProfiles}
        agreements={agreements}
        initialTab={
          tab === "compensation" || tab === "vacation" || tab === "payroll"
            ? tab
            : undefined
        }
        payroll={payroll}
        municipalities={rates?.municipalities ?? []}
        taxYear={rates?.year ?? null}
        compensationFailed={Boolean(compensationFailed)}
      />
    </>
  );
}
