import "server-only";

import { notFound, redirect } from "next/navigation";
import type { PortalUser } from "@/domain/types";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  canViewAssets,
  canViewOwnAssets,
} from "@/server/services/asset-service";
import { toAssetItem } from "./asset-data";

/**
 * The asset a register page is about, or a 404. `manage` pages also need
 * the right to change equipment; people who only see their own equipment
 * are sent to their own page.
 */
export async function loadAssetPage(id: string, manage: boolean) {
  const actor: PortalUser = (await verifySession())!;
  if (!canViewAssets(actor))
    redirect(canViewOwnAssets(actor) ? "/assets/mine" : "/unauthorized");
  if (manage && !canManageAssets(actor)) redirect("/unauthorized");
  const { db } = getAdminServices();
  const snapshot = await db.collection("assets").doc(id).get();
  if (snapshot.data()?.organizationId !== actor.organizationId) notFound();
  const asset = toAssetItem(snapshot, actor);
  if (!asset) notFound();
  return { actor, db, asset };
}
