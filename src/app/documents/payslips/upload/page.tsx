import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canManagePayslips } from "@/server/services/payslip-service";
import { PayslipUploadForm } from "./PayslipUploadForm";

export default async function UploadPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canManagePayslips(actor)) redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const users = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .where("role", "in", ["employee", "consultant", "manager"])
    .get();
  const recipients = users.docs
    .filter((doc) => doc.data().status === "active")
    .map((doc) => ({
      id: doc.id,
      name: String(doc.data().displayName),
      employeeNumber: String(doc.data().employeeNumber ?? ""),
      role: String(doc.data().role),
      hasAccess: doc.data().documentAccess?.payslips === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const now = new Date();
  const requested = Number((await searchParams).year);
  const defaultYear =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : now.getFullYear();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("payslips")}</div>
          <h1>{t("uploadPayslips")}</h1>
          <p className="muted page-description">
            {t("uploadPayslipsDescription")}
          </p>
        </div>
      </div>
      <PayslipUploadForm
        recipients={recipients}
        defaultYear={defaultYear}
        defaultMonth={now.getMonth() + 1}
      />
    </>
  );
}
