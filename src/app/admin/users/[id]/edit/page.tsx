import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { EmployeeEditor } from "../../EmployeeEditor";
import { toManagedUser } from "../../user-data";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const snapshot = await db.collection("users").doc(id).get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    notFound();
  const employee = toManagedUser(snapshot);
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
      <EmployeeEditor employee={employee} isSelf={employee.id === actor.id} />
    </>
  );
}
