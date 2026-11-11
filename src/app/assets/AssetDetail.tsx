"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionIcon } from "@/components/ui/ActionIcon";
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
import { assetErrorKey } from "./AssetForm";
import {
  canChangeHolder,
  canDeleteAsset,
  canEditAsset,
  canIssueHandover,
  canLinkTransaction,
  canRetire,
  canReturnHandover,
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
  handoverPdfUrl,
  handoverScanUrl,
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
  const router = useRouter();
  const holderLabel = useHolderLabel();
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returned, setReturned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = t("attachmentDeleteConfirmationPhrase");

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !menuRef.current?.contains(event.target as Node)
      )
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const activeHandover = handovers.find(
    (handover) => handover.id === asset.activeHandoverId,
  );
  const canReturn =
    canManage &&
    activeHandover !== undefined &&
    canReturnHandover(activeHandover);
  const othersOnReceipt = new Set(
    (activeHandover?.lines ?? [])
      .map((line) => line.assetId)
      .filter((assetId) => assetId !== asset.id),
  ).size;

  async function returnToCompany() {
    if (!activeHandover) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/assets/handovers/${encodeURIComponent(activeHandover.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "return", location: "" }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      setReturning(false);
      setReturned(true);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  const id = encodeURIComponent(asset.id);

  async function removeAsset() {
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(`/api/assets/${id}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      router.push("/assets?removed=1");
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  const menuItems = canManage
    ? [
        canIssueHandover(asset) && (
          <Link
            key="handover"
            role="menuitem"
            href={`/assets/handovers/new?assetId=${id}`}
          >
            {t("handoverNew")}
          </Link>
        ),
        canReturn && (
          <button
            key="return"
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setError("");
              setReturning(true);
            }}
          >
            {t("assetReturnToCompany")}
          </button>
        ),
        asset.activeHandoverId && (
          <Link
            key="receipt"
            role="menuitem"
            href={`/assets/handovers/${encodeURIComponent(asset.activeHandoverId)}`}
          >
            {t("handoverOpen")}
          </Link>
        ),
        canChangeHolder(asset) && (
          <Link key="holder" role="menuitem" href={`/assets/${id}/holder`}>
            {t("assetChangeHolder")}
          </Link>
        ),
        canSell(asset) && (
          <Link key="sell" role="menuitem" href={`/assets/${id}/sell`}>
            {t("assetSell")}
          </Link>
        ),
        canRetire(asset) && (
          <Link key="retire" role="menuitem" href={`/assets/${id}/retire`}>
            {t("assetRetire")}
          </Link>
        ),
        <button
          key="remove"
          type="button"
          role="menuitem"
          className="more-menu-danger"
          disabled={!canDeleteAsset(asset)}
          title={canDeleteAsset(asset) ? undefined : t("assetRemoveBlocked")}
          onClick={() => {
            setMenuOpen(false);
            setError("");
            setConfirmation("");
            setRemoving(true);
          }}
        >
          {t("assetRemove")}
        </button>,
      ].filter(Boolean)
    : [];
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
          {menuItems.length > 0 && (
            <div className="more-anchor" ref={menuRef}>
              <button
                type="button"
                className="button secondary more-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t("assetMoreActions")}
                title={t("assetMoreActions")}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <ActionIcon type="more" />
              </button>
              {menuOpen && (
                <div className="more-menu" role="menu">
                  {menuItems}
                </div>
              )}
            </div>
          )}
        </div>
      </AssetTopbar>
      {saved && (
        <p className="notice notice-success" role="status">
          {t("assetSaved")}
        </p>
      )}
      {returned && (
        <p className="notice notice-success" role="status">
          {t("assetReturnedToCompany")}
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
                    <strong>
                      {formatSek(asset.purchasePriceMinor, locale)}
                    </strong>
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
      </section>
      {removing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="asset-remove-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="asset-remove-title">{t("assetRemoveTitle")}</h2>
                <p>{t("assetRemoveQuestion").replace("{name}", asset.name)}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setRemoving(false)}
              >
                ×
              </button>
            </header>
            <label>
              {t("typeAttachmentDeleteConfirmation").replace(
                "{phrase}",
                phrase,
              )}
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRemoving(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button danger"
                disabled={busy || confirmation.trim() !== phrase}
                onClick={() => void removeAsset()}
              >
                {busy ? t("saving") : t("assetRemove")}
              </button>
            </footer>
          </section>
        </div>
      )}
      {returning && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="asset-return-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="asset-return-title">{t("assetReturnTitle")}</h2>
                <p>
                  {t("assetReturnQuestion").replace(
                    "{name}",
                    activeHandover?.recipientName ?? "",
                  )}
                </p>
                {othersOnReceipt > 0 && (
                  <p>
                    {t("assetReturnOthers").replace(
                      "{count}",
                      String(othersOnReceipt),
                    )}
                  </p>
                )}
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setReturning(false)}
              >
                ×
              </button>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setReturning(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void returnToCompany()}
              >
                {busy ? t("saving") : t("assetReturnToCompany")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
