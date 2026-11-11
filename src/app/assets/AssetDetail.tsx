"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  DetailFacts,
  DetailFile,
  DetailFiles,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
} from "@/components/ui/DetailView";
import { FilePreviewAction } from "@/components/ui/FilePreview";
import {
  canChangeHolder,
  canEditAsset,
  canIssueHandover,
  canLinkTransaction,
  canRetire,
  canSell,
  type AssetLink,
} from "@/domain/assets";
import { formatSek } from "@/domain/finance/calculations";
import type { MessageKey } from "@/lib/localization/messages";
import {
  AssetStatusBadge,
  AssetTopbar,
  HandoverStatusBadge,
  useHolderLabel,
} from "./AssetParts";
import {
  assetFileUrl,
  type AssetEventItem,
  type AssetItem,
  type HandoverItem,
} from "./asset-types";

export function AssetDetail({
  asset,
  history,
  handovers,
  canManage,
  canBook,
  saved,
}: {
  asset: AssetItem;
  history: AssetEventItem[];
  handovers: HandoverItem[];
  canManage: boolean;
  /** Finance is on and this person may add transactions. */
  canBook: boolean;
  saved: boolean;
}) {
  const { t, locale } = useLocale();
  const holderLabel = useHolderLabel();
  const id = encodeURIComponent(asset.id);
  const bookHref = (link: AssetLink) =>
    `/finance/transactions/new?assetId=${id}&assetLink=${link}`;
  const financeRow = (
    link: AssetLink,
    transactionId: string | null,
  ): [string, React.ReactNode] | null => {
    if (transactionId)
      return [
        t(link === "purchase" ? "assetPurchaseBooked" : "assetSaleBooked"),
        <DetailTag key={link} tone="positive">
          {t("assetBookedInFinance")}
        </DetailTag>,
      ];
    if (canManage && canBook && canLinkTransaction(asset, link))
      return [
        t(link === "purchase" ? "assetPurchaseBooked" : "assetSaleBooked"),
        <Link key={link} href={bookHref(link)}>
          {t(link === "purchase" ? "assetBookPurchase" : "assetBookSale")}
        </Link>,
      ];
    return null;
  };

  return (
    <>
      <AssetTopbar
        title={asset.name}
        eyebrow={`${t("assets")} · ${t(`assetCategory_${asset.category}`)}`}
      >
        <div className="actions">
          <Link className="button secondary" href="/assets">
            {t("assetBackToRegister")}
          </Link>
          {canManage && canEditAsset(asset) && (
            <Link className="button secondary" href={`/assets/${id}/edit`}>
              {t("assetEdit")}
            </Link>
          )}
          {canManage && canIssueHandover(asset) && (
            <Link
              className="button"
              href={`/assets/handovers/new?assetId=${id}`}
            >
              {t("handoverNew")}
            </Link>
          )}
        </div>
      </AssetTopbar>
      {saved && (
        <p className="notice notice-success" role="status">
          {t("assetSaved")}
        </p>
      )}
      <section className="card">
        <DetailSummary
          tone={asset.status === "active" ? "positive" : "neutral"}
          tags={
            <>
              <AssetStatusBadge status={asset.status} />
              {asset.handoverStatus && (
                <HandoverStatusBadge status={asset.handoverStatus} />
              )}
            </>
          }
          amount={formatSek(asset.purchasePriceMinor, locale)}
          headline={`${t("assetHolder")}: ${holderLabel(asset.holder)}`}
        >
          {asset.notes}
        </DetailSummary>
        {canManage && (
          <div className="actions asset-actions">
            {canChangeHolder(asset) && (
              <Link className="button secondary" href={`/assets/${id}/holder`}>
                {t("assetChangeHolder")}
              </Link>
            )}
            {canSell(asset) && (
              <Link className="button secondary" href={`/assets/${id}/sell`}>
                {t("assetSell")}
              </Link>
            )}
            {canRetire(asset) && (
              <Link className="button secondary" href={`/assets/${id}/retire`}>
                {t("assetRetire")}
              </Link>
            )}
            {asset.activeHandoverId && (
              <Link
                className="button secondary"
                href={`/assets/handovers/${encodeURIComponent(asset.activeHandoverId)}`}
              >
                {t("handoverOpen")}
              </Link>
            )}
          </div>
        )}
        <DetailSections>
          <DetailSection title={t("assetDetails")}>
            <DetailFacts
              rows={[
                [t("assetMake"), asset.make],
                [t("assetModel"), asset.model],
                [t("assetSerialNumber"), asset.serialNumber],
                [t("assetAccessories"), asset.accessories],
              ]}
            />
          </DetailSection>
          <DetailSection title={t("assetPurchase")}>
            <DetailFacts
              rows={[
                [t("assetPurchaseDate"), asset.purchaseDate ?? ""],
                [t("assetSupplier"), asset.supplier],
                [
                  t("assetPurchasePrice"),
                  formatSek(asset.purchasePriceMinor, locale),
                ],
                [t("requestVatRate"), `${asset.vatRateBps / 100} %`],
                financeRow("purchase", asset.purchaseTransactionId),
              ]}
            />
          </DetailSection>
          {asset.sale && (
            <DetailSection title={t("assetSale")}>
              <DetailFacts
                rows={[
                  [t("assetSaleDate"), asset.sale.date],
                  [t("assetBuyer"), asset.sale.buyerName],
                  [
                    t("assetSalePrice"),
                    formatSek(asset.sale.priceMinor, locale),
                  ],
                  financeRow("sale", asset.saleTransactionId),
                ]}
              />
            </DetailSection>
          )}
          {asset.retirement && (
            <DetailSection title={t(`assetStatus_${asset.status}`)}>
              <DetailFacts
                rows={[
                  [t("date"), asset.retirement.date],
                  [t("assetNote"), asset.retirement.note],
                ]}
              />
            </DetailSection>
          )}
        </DetailSections>
        {asset.files.length > 0 && (
          <DetailSection title={t("assetFiles")} count={asset.files.length}>
            <DetailFiles>
              {asset.files.map((file) => (
                <DetailFile
                  key={file.id}
                  name={file.name}
                  contentType={file.contentType}
                  size={file.size}
                >
                  <FilePreviewAction
                    target={{
                      name: file.name,
                      contentType: file.contentType,
                      fileUrl: assetFileUrl(asset.id, file.id),
                    }}
                  />
                </DetailFile>
              ))}
            </DetailFiles>
          </DetailSection>
        )}
        {handovers.length > 0 && (
          <DetailSection title={t("handovers")} count={handovers.length}>
            <ol className="request-history">
              {handovers.map((handover) => (
                <li key={handover.id}>
                  <HandoverStatusBadge status={handover.status} />
                  <Link
                    href={`/assets/handovers/${encodeURIComponent(handover.id)}`}
                  >
                    {handover.issuedOn} · {handover.recipientName}
                  </Link>
                </li>
              ))}
            </ol>
          </DetailSection>
        )}
        {history.length > 0 && (
          <DetailSection title={t("assetHistory")}>
            <ol className="request-history">
              {history.map((event, index) => (
                <li key={`${event.performedAt}-${index}`}>
                  <strong>{t(`assetEvent_${event.kind}` as MessageKey)}</strong>
                  <span className="muted">
                    {event.performedAt.slice(0, 10)} · {event.performedByName}
                    {event.holder ? ` · ${holderLabel(event.holder)}` : ""}
                  </span>
                  {event.note && <p>{event.note}</p>}
                </li>
              ))}
            </ol>
          </DetailSection>
        )}
      </section>
    </>
  );
}
