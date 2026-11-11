import { redirect } from "next/navigation";
import { canIssueHandover } from "@/domain/assets";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  handoverRecipients,
} from "@/server/services/asset-service";
import { HandoverForm } from "../../HandoverForm";
import { byName, toAssetItem } from "../../asset-data";
import type { AssetItem } from "../../asset-types";

export default async function NewHandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canManageAssets(actor)) redirect("/unauthorized");
  const { assetId } = await searchParams;
  const { db } = getAdminServices();
  const [t, snapshot, recipients] = await Promise.all([
    getTranslator(),
    db
      .collection("assets")
      .where("organizationId", "==", actor.organizationId)
      .where("status", "==", "active")
      .get(),
    handoverRecipients(db, actor.organizationId),
  ]);
  const assets = snapshot.docs
    .map((doc) => toAssetItem(doc, actor))
    .filter(
      (item): item is AssetItem => item !== null && canIssueHandover(item),
    )
    .sort(byName);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("assets")}</div>
          <h1>{t("handoverNew")}</h1>
          <p className="muted page-description">
            {t("handoverNewDescription")}
          </p>
        </div>
      </div>
      <HandoverForm
        assets={assets}
        recipients={recipients}
        selected={
          assets.some((asset) => asset.id === assetId) ? assetId! : null
        }
      />
    </>
  );
}
