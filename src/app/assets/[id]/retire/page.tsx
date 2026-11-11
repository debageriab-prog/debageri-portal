import { redirect } from "next/navigation";
import { canRetire } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { AssetActionForm } from "../../AssetActionForm";
import { FormHeader } from "../../FormHeader";
import { loadAssetPage } from "../../load-asset";

export default async function RetireAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset } = await loadAssetPage(id, true);
  if (!canRetire(asset)) redirect("/assets");
  const t = await getTranslator();
  return (
    <>
      <FormHeader
        backHref="/assets"
        backLabel={t("assetBackToRegister")}
        title={t("assetRetire")}
        description={t("assetRetireDescription")}
      />
      <AssetActionForm asset={asset} mode="retire" />
    </>
  );
}
