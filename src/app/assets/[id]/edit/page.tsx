import { redirect } from "next/navigation";
import { canEditAsset } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
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
  const t = await getTranslator();
  return (
    <>
      <FormHeader
        backHref={`/assets/${encodeURIComponent(id)}`}
        backLabel={t("assetBackToAsset")}
        title={t("assetEdit")}
        description={asset.name}
      />
      <AssetForm asset={asset} />
    </>
  );
}
