"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { appCheckFetch } from "@/lib/firebase/client";
import { canLinkTransaction, type AssetLink } from "@/domain/assets";
import { formatSek } from "@/domain/finance/calculations";
import type { MessageKey } from "@/lib/localization/messages";
import {
  AssetDisplayStatusBadge,
  HandoverStatusBadge,
  useHolderLabel,
} from "./AssetParts";
import {
  assetFileUrl,
  handoverPdfUrl,
  handoverScanUrl,
  type AssetEventItem,
  type AssetItem,
  type HandoverItem,
} from "./asset-types";

type AssetDetails = {
  asset: AssetItem;
  history: AssetEventItem[];
  handovers: HandoverItem[];
  /** Finance is on and this person may add transactions. */
  canBook: boolean;
};

/** The ⓘ popup in Assets management: everything about one asset. */
export function AssetDetailModal({
  assetId,
  canManage,
  onClose,
}: {
  assetId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [details, setDetails] = useState<AssetDetails | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    appCheckFetch(`/api/assets/${encodeURIComponent(assetId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("assetDetailsLoadFailed");
        const value = (await response.json()) as AssetDetails;
        if (active) setDetails(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [assetId, onClose]);

  const asset = details?.asset;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal detail-modal detail-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              {asset ? t(`assetCategory_${asset.category}`) : t("assets")}
            </span>
            <h2 id="asset-view-title">{asset?.name ?? t("loading")}</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {failed ? (
          <p className="notice notice-error" role="alert">
            {t("assetDetailsLoadFailed")}
          </p>
        ) : !details ? (
          <p className="muted">{t("loading")}</p>
        ) : (
          <AssetDetailBody {...details} canManage={canManage} />
        )}
      </section>
    </div>
  );
}

function AssetDetailBody({
  asset,
  history,
  handovers,
  canManage,
  canBook,
}: AssetDetails & { canManage: boolean }) {
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
      <DetailSummary
        tone={asset.status === "active" ? "positive" : "neutral"}
        tags={<AssetDisplayStatusBadge asset={asset} />}
        amount={formatSek(asset.purchasePriceMinor, locale)}
        headline={`${t("assetHolder")}: ${holderLabel(asset.holder)}`}
      >
        {asset.notes}
      </DetailSummary>
      <DetailSection title={t("assetParts")} count={asset.parts.length}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("assetPartName")}</th>
                <th>{t("assetReceiptMakeModel")}</th>
                <th>{t("assetSerialNumber")}</th>
                <th>{t("assetAccessories")}</th>
                <th className="amount-heading">{t("assetPartPrice")}</th>
              </tr>
            </thead>
            <tbody>
              {asset.parts.map((part, index) => (
                <tr key={index}>
                  <td>{part.name}</td>
                  <td>
                    {[part.make, part.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td>{part.serialNumber || "—"}</td>
                  <td>{part.accessories || "—"}</td>
                  <td className="amount-cell">
                    {formatSek(part.priceMinor, locale)}
                  </td>
                </tr>
              ))}
              {asset.otherCostsMinor > 0 && (
                <tr>
                  <td colSpan={4}>{t("assetOtherCosts")}</td>
                  <td className="amount-cell">
                    {formatSek(asset.otherCostsMinor, locale)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={4}>
                  <strong>{t("assetPurchasePrice")}</strong>
                </td>
                <td className="amount-cell">
                  <strong>{formatSek(asset.purchasePriceMinor, locale)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DetailSection>
      <DetailSections>
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
                [t("assetSalePrice"), formatSek(asset.sale.priceMinor, locale)],
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
      <DetailSection
        title={t("assetFiles")}
        count={
          asset.files.length +
          handovers.length +
          handovers.filter((handover) => handover.scan).length
        }
      >
        {asset.files.length + handovers.length === 0 ? (
          <p className="muted">{t("assetDocumentsEmpty")}</p>
        ) : (
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
            {handovers.flatMap((handover) => {
              const name = t("assetHandoverDocument")
                .replace("{name}", handover.recipientName)
                .replace("{date}", handover.issuedOn);
              return [
                <DetailFile
                  key={handover.id}
                  name={name}
                  contentType="application/pdf"
                >
                  <HandoverStatusBadge status={handover.status} />
                  <Link
                    className="table-action icon-action"
                    aria-label={t("handoverOpen")}
                    title={t("handoverOpen")}
                    href={`/assets/handovers/${encodeURIComponent(handover.id)}`}
                  >
                    <span aria-hidden="true">i</span>
                  </Link>
                  <FilePreviewAction
                    target={{
                      name: `${name}.pdf`,
                      contentType: "application/pdf",
                      fileUrl: handoverPdfUrl(handover.id),
                    }}
                  />
                </DetailFile>,
                ...(handover.scan
                  ? [
                      <DetailFile
                        key={`${handover.id}-scan`}
                        name={t("assetHandoverScanDocument").replace(
                          "{name}",
                          handover.scan.name,
                        )}
                        contentType={handover.scan.contentType}
                        size={handover.scan.size}
                      >
                        <FilePreviewAction
                          target={{
                            name: handover.scan.name,
                            contentType: handover.scan.contentType,
                            fileUrl: handoverScanUrl(handover.id),
                          }}
                        />
                      </DetailFile>,
                    ]
                  : []),
              ];
            })}
          </DetailFiles>
        )}
      </DetailSection>
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
    </>
  );
}
