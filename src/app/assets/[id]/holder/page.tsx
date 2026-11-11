import { redirect } from "next/navigation";
import { canChangeHolder } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { AssetActionForm } from "../../AssetActionForm";
import { FormHeader } from "../../FormHeader";
import { loadAssetPage } from "../../load-asset";

export default async function AssetHolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset } = await loadAssetPage(id, true);
  if (!canChangeHolder(asset)) redirect(`/assets/${encodeURIComponent(id)}`);
  const t = await getTranslator();
  return (
    <>
      <FormHeader
        backHref={`/assets/${encodeURIComponent(id)}`}
        backLabel={t("assetBackToAsset")}
        title={t("assetChangeHolder")}
        description={t("assetChangeHolderDescription")}
      />
      <AssetActionForm asset={asset} mode="holder" />
    </>
  );
}
