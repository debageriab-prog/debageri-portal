import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canManageContracts } from "@/server/services/contract-service";
import { ContractForm } from "../ContractForm";

export default async function NewContractPage() {
  const actor = (await verifySession())!;
  if (!canManageContracts(actor)) redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const users = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .where("role", "==", "consultant")
    .get();
  const consultants = users.docs
    .filter((doc) => doc.data().status === "active")
    .map((doc) => ({ id: doc.id, name: String(doc.data().displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("contracts")}</div>
          <h1>{t("addContract")}</h1>
          <p className="muted page-description">
            {t("addContractDescription")}
          </p>
        </div>
      </div>
      <ContractForm consultants={consultants} />
    </>
  );
}
