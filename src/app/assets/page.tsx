import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  canViewAssets,
  canViewOwnAssets,
  handoverRecipients,
} from "@/server/services/asset-service";
import { AssetRegister, type RegisterNotice } from "./AssetRegister";
import { byName, toAssetItem } from "./asset-data";
import type { AssetItem } from "./asset-types";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; saved?: string; issued?: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canViewAssets(actor))
    redirect(canViewOwnAssets(actor) ? "/assets/mine" : "/unauthorized");
  const { asset, saved, issued } = await searchParams;
  const { db } = getAdminServices();
  const canManage = canManageAssets(actor);
  const [snapshot, recipients] = await Promise.all([
    db
      .collection("assets")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    canManage ? handoverRecipients(db, actor.organizationId) : [],
  ]);
  const assets = snapshot.docs
    .map((doc) => toAssetItem(doc, actor))
    .filter((item): item is AssetItem => item !== null)
    .sort(byName);
  const notice: RegisterNotice | null =
    issued === "1" ? "issued" : saved === "1" ? "saved" : null;
  return (
    <AssetRegister
      assets={assets}
      canManage={canManage}
      recipients={recipients}
      openAssetId={asset ?? null}
      notice={notice}
    />
  );
}
