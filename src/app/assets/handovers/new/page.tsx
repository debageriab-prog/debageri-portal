import { redirect } from "next/navigation";
import { canIssueHandover } from "@/domain/assets";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  canManageAssets,
  handoverRecipients,
} from "@/server/services/asset-service";
import { FormHeader } from "../../FormHeader";
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
      <FormHeader
        backHref={
          assetId && assets.some((asset) => asset.id === assetId)
            ? `/assets/${encodeURIComponent(assetId)}`
            : "/assets"
        }
        backLabel={t(
          assetId && assets.some((asset) => asset.id === assetId)
            ? "assetBackToAsset"
            : "assetBackToRegister",
        )}
        title={t("handoverNew")}
        description={t("handoverNewDescription")}
      />
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
