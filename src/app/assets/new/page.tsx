import { redirect } from "next/navigation";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canManageAssets } from "@/server/services/asset-service";
import { AssetForm } from "../AssetForm";

export default async function NewAssetPage() {
  const actor = (await verifySession())!;
  if (!canManageAssets(actor)) redirect("/unauthorized");
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("assets")}</div>
          <h1>{t("assetNew")}</h1>
          <p className="muted page-description">{t("assetNewDescription")}</p>
        </div>
      </div>
      <AssetForm />
    </>
  );
}
