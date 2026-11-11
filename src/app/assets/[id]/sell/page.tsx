import { redirect } from "next/navigation";
import { canSell } from "@/domain/assets";
import { getTranslator } from "@/lib/localization/server";
import { byName } from "../../asset-data";
import { AssetActionForm } from "../../AssetActionForm";
import { loadAssetPage } from "../../load-asset";

export default async function SellAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor, db, asset } = await loadAssetPage(id, true);
  if (!canSell(asset)) redirect(`/assets/${encodeURIComponent(id)}`);
  const [t, users] = await Promise.all([
    getTranslator(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{asset.name}</div>
          <h1>{t("assetSell")}</h1>
          <p className="muted page-description">{t("assetSellDescription")}</p>
        </div>
      </div>
      <AssetActionForm
        asset={asset}
        mode="sell"
        users={users.docs
          .filter(
            (doc) =>
              doc.data().status === "active" || doc.id === asset.holder.userId,
          )
          .map((doc) => ({ id: doc.id, name: String(doc.data().displayName) }))
          .sort(byName)}
      />
    </>
  );
}
