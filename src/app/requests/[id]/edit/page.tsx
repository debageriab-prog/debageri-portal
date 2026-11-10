import { notFound, redirect } from "next/navigation";
import { isEditableRequest, requestTypesFor } from "@/domain/requests";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canViewOwnRequests } from "@/server/services/request-service";
import { RequestForm } from "../../RequestForm";
import { toRequestItem } from "../../request-data";

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = (await verifySession())!;
  if (!canViewOwnRequests(actor)) redirect("/unauthorized");
  const { db } = getAdminServices();
  const snapshot = await db.collection("requests").doc(id).get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.organizationId !== actor.organizationId ||
    data.userId !== actor.id
  )
    notFound();
  const request = toRequestItem(
    snapshot as FirebaseFirestore.QueryDocumentSnapshot,
    new Map(),
  );
  if (!request) notFound();
  if (!isEditableRequest(request)) redirect("/requests?mine=1");
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("requests")}</div>
          <h1>{t("editRequest")}</h1>
          <p className="muted page-description">
            {t("editRequestDescription")}
          </p>
        </div>
      </div>
      <RequestForm types={requestTypesFor(actor)} request={request} />
    </>
  );
}
