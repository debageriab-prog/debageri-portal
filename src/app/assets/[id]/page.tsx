import { can } from "@/domain/access/permissions";
import { canManageAssets } from "@/server/services/asset-service";
import { financeIsEnabled } from "@/server/services/finance-service";
import { AssetDetail } from "../AssetDetail";
import { toAssetEvent, toHandoverItem } from "../asset-data";
import type { HandoverItem } from "../asset-types";
import { loadAssetPage } from "../load-asset";

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { actor, db, asset } = await loadAssetPage(id, false);
  const [events, handovers, financeEnabled] = await Promise.all([
    db
      .collection("assetEvents")
      .where("organizationId", "==", actor.organizationId)
      .where("assetId", "==", id)
      .get(),
    db
      .collection("assetHandovers")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    financeIsEnabled(db, actor.organizationId),
  ]);
  return (
    <AssetDetail
      asset={asset}
      history={events.docs
        .map(toAssetEvent)
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt))}
      handovers={handovers.docs
        .filter((doc) =>
          (doc.data().assetIds as unknown[] | undefined)?.includes(id),
        )
        .map(toHandoverItem)
        .filter((item): item is HandoverItem => item !== null)
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))}
      canManage={canManageAssets(actor)}
      canBook={financeEnabled && can(actor, "finance.ledger.add")}
      saved={saved === "1"}
    />
  );
}
