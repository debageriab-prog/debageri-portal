import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { contractVisible } from "@/server/services/contract-service";
import { ContractList } from "./ContractList";

export default async function ContractsPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("contracts")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const visible = snapshot.docs.filter((doc) =>
    contractVisible(actor, doc.data()),
  );
  const files = await Promise.all(
    visible.map(async (doc) => {
      const result = await db
        .collection("contractFiles")
        .where("organizationId", "==", actor.organizationId)
        .where("contractId", "==", doc.id)
        .get();
      return result.docs.map((file) => ({
        id: file.id,
        name: String(file.data().name),
        size: Number(file.data().size),
      }));
    }),
  );
  const contracts = visible
    .map((doc, index) => ({
      id: doc.id,
      name: String(doc.data().name),
      documentDate: String(doc.data().documentDate),
      validTo: doc.data().validTo ? String(doc.data().validTo) : null,
      ownerType: doc.data().ownerType as "company" | "consultant",
      consultantId: doc.data().consultantId
        ? String(doc.data().consultantId)
        : null,
      consultantName: doc.data().consultantName
        ? String(doc.data().consultantName)
        : null,
      visibleToConsultant: doc.data().visibleToConsultant === true,
      confidential: doc.data().confidential === true,
      files: files[index] ?? [],
    }))
    .sort((a, b) => b.documentDate.localeCompare(a.documentDate));
  return (
    <ContractList
      contracts={contracts}
      canManage={["admin", "manager"].includes(actor.role)}
      viewerIsConsultant={actor.role === "consultant"}
    />
  );
}
