import { redirect } from "next/navigation";
import { canEditAsset } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { AssetForm } from "../../AssetForm";
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
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("assets")}</div>
          <h1>{t("assetEdit")}</h1>
          <p className="muted page-description">{asset.name}</p>
        </div>
      </div>
      <AssetForm asset={asset} />
    </>
  );
}
