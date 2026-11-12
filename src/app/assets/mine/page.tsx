import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  assetVisible,
  canViewOwnAssets,
} from "@/server/services/asset-service";
import { MyAssets } from "../MyAssets";
import { byName, toAssetItem, toHandoverItem } from "../asset-data";
import type { AssetItem, HandoverItem } from "../asset-types";

export default async function MyAssetsPage() {
  const actor = (await verifySession())!;
  if (!canViewOwnAssets(actor)) redirect("/unauthorized");
  const { db } = getAdminServices();
  const [assets, handovers] = await Promise.all([
    db
      .collection("assets")
      .where("organizationId", "==", actor.organizationId)
      .where("holder.userId", "==", actor.id)
      .get(),
    db
      .collection("assetHandovers")
      .where("organizationId", "==", actor.organizationId)
      .where("recipientUserId", "==", actor.id)
      .get(),
  ]);
  return (
    <MyAssets
      assets={assets.docs
        .filter((doc) => {
          const data = doc.data();
          return assetVisible(actor, data) && data.status === "active";
        })
        .map((doc) => toAssetItem(doc, actor))
        .filter((item): item is AssetItem => item !== null)
        .sort(byName)}
      handovers={handovers.docs
        .map(toHandoverItem)
        .filter(
          (item): item is HandoverItem =>
            item !== null && item.status !== "cancelled",
        )
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))}
    />
  );
}
