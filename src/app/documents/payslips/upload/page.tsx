import { redirect } from "next/navigation";
import { parsePayslipPeriod } from "@/domain/payslips";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canManagePayslips } from "@/server/services/payslip-service";
import { receivesDocuments } from "@/server/validators/user-access";
import { PayslipUploadForm } from "./PayslipUploadForm";

export default async function UploadPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
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
    .filter((doc) => receivesDocuments(doc.data()))
    .map((doc) => ({
      id: doc.id,
      name: String(doc.data().displayName),
      employeeNumber: String(doc.data().employeeNumber ?? ""),
      role: String(doc.data().role),
      hasAccess: doc.data().documentAccess?.payslips === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const requested = (await searchParams).period ?? "";
  const defaultPeriod = parsePayslipPeriod(requested)
    ? requested
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());
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
        defaultPeriod={defaultPeriod}
      />
    </>
  );
}
