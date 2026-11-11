import { redirect } from "next/navigation";
import { canChangeHolder } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { AssetActionForm } from "../../AssetActionForm";
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
      <div className="topbar">
        <div>
          <div className="eyebrow">{asset.name}</div>
          <h1>{t("assetChangeHolder")}</h1>
          <p className="muted page-description">
            {t("assetChangeHolderDescription")}
          </p>
        </div>
      </div>
      <AssetActionForm asset={asset} mode="holder" />
    </>
  );
}
