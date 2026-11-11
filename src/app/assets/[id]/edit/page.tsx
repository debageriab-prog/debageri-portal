import { redirect } from "next/navigation";
import { canEditAsset } from "@/domain/assets";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { isAiFeatureEnabled } from "@/server/services/ai-service";
import { AssetForm } from "../../AssetForm";
import { FormHeader } from "../../FormHeader";
import { loadAssetPage } from "../../load-asset";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset } = await loadAssetPage(id, true);
  if (!canEditAsset(asset)) redirect(`/assets/${encodeURIComponent(id)}`);
  const actor = (await verifySession())!;
  const [t, aiEnabled] = await Promise.all([
    getTranslator(),
    isAiFeatureEnabled(
      getAdminServices().db,
      actor.organizationId,
      "financeAttachments",
    ),
  ]);
  return (
    <>
      <FormHeader
        backHref={`/assets/${encodeURIComponent(id)}`}
        backLabel={t("assetBackToAsset")}
        title={t("assetEdit")}
        description={asset.name}
      />
      <AssetForm asset={asset} aiEnabled={aiEnabled} />
    </>
  );
}
