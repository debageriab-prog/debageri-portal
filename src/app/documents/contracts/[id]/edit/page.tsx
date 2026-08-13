import { notFound, redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canManageContracts } from "@/server/services/contract-service";
import { ContractForm } from "../../ContractForm";

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canManageContracts(actor)) redirect("/unauthorized");
  const { id } = await params;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [snapshot, users, fileSnapshot] = await Promise.all([
    db.collection("contracts").doc(id).get(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .where("role", "==", "consultant")
      .get(),
    db
      .collection("contractFiles")
      .where("organizationId", "==", actor.organizationId)
      .where("contractId", "==", id)
      .get(),
  ]);
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    notFound();
  const data = snapshot.data()!;
  const contract = {
    id,
    name: String(data.name),
    documentDate: String(data.documentDate),
    ownerType: data.ownerType as "company" | "consultant",
    consultantId: data.consultantId ? String(data.consultantId) : null,
    consultantName: data.consultantName ? String(data.consultantName) : null,
    visibleToConsultant: data.visibleToConsultant === true,
    confidential: data.confidential === true,
    files: fileSnapshot.docs.map((file) => ({
      id: file.id,
      name: String(file.data().name),
      size: Number(file.data().size),
    })),
  };
  const consultants = users.docs
    .map((doc) => ({ id: doc.id, name: String(doc.data().displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("contracts")}</div>
          <h1>{t("editContract")}</h1>
          <p className="muted page-description">
            {t("editContractDescription")}
          </p>
        </div>
      </div>
      <ContractForm consultants={consultants} contract={contract} />
    </>
  );
}
