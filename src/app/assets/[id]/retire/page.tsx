import { redirect } from "next/navigation";
import { canRetire } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { AssetActionForm } from "../../AssetActionForm";
import { loadAssetPage } from "../../load-asset";

export default async function RetireAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset } = await loadAssetPage(id, true);
  if (!canRetire(asset)) redirect(`/assets/${encodeURIComponent(id)}`);
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{asset.name}</div>
          <h1>{t("assetRetire")}</h1>
          <p className="muted page-description">
            {t("assetRetireDescription")}
          </p>
        </div>
      </div>
      <AssetActionForm asset={asset} mode="retire" />
    </>
  );
}
