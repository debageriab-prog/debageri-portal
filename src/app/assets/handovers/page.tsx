import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  canViewAssets,
  canViewOwnAssets,
} from "@/server/services/asset-service";
import { HandoverList } from "../HandoverList";
import { toHandoverItem } from "../asset-data";
import type { HandoverItem } from "../asset-types";

export default async function HandoversPage({
  searchParams,
}: {
  searchParams: Promise<{ issued?: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canViewAssets(actor))
    redirect(canViewOwnAssets(actor) ? "/assets/mine" : "/unauthorized");
  const { issued } = await searchParams;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("assetHandovers")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const handovers = snapshot.docs
    .map(toHandoverItem)
    .filter((item): item is HandoverItem => item !== null)
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn));
  return (
    <HandoverList
      handovers={handovers}
      canManage={canManageAssets(actor)}
      issued={issued === "1"}
    />
  );
}
