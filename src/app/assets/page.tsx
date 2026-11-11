import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  canViewAssets,
  canViewOwnAssets,
} from "@/server/services/asset-service";
import { AssetRegister } from "./AssetRegister";
import { byName, toAssetItem } from "./asset-data";
import type { AssetItem } from "./asset-types";

export default async function AssetsPage() {
  const actor = (await verifySession())!;
  if (!canViewAssets(actor))
    redirect(canViewOwnAssets(actor) ? "/assets/mine" : "/unauthorized");
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("assets")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const assets = snapshot.docs
    .map((doc) => toAssetItem(doc, actor))
    .filter((item): item is AssetItem => item !== null)
    .sort(byName);
  return <AssetRegister assets={assets} canManage={canManageAssets(actor)} />;
}
