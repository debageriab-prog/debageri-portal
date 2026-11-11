import { notFound } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  canViewAssets,
  handoverVisible,
} from "@/server/services/asset-service";
import { HandoverView } from "../../HandoverView";
import { toHandoverItem } from "../../asset-data";

export default async function HandoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const { id } = await params;
  const { issued } = await searchParams;
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db.collection("assetHandovers").doc(id).get();
  const data = snapshot.data();
  if (!data || !handoverVisible(actor, data)) notFound();
  const handover = toHandoverItem(snapshot);
  if (!handover) notFound();
  return (
    <HandoverView
      handover={handover}
      isRecipient={handover.recipientUserId === actor.id}
      canManage={canManageAssets(actor)}
      canViewRegister={canViewAssets(actor)}
      issued={issued === "1"}
    />
  );
}
