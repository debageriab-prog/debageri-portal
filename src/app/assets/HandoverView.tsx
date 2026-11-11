"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FilePreviewAction } from "@/components/ui/FilePreview";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ASSET_MAX_BYTES,
  ASSET_TERM_KEYS,
  canCancelHandover,
  canReturnHandover,
  isAssetContentType,
} from "@/domain/assets";
import { appCheckFetch } from "@/lib/firebase/client";
import { assetErrorKey } from "./AssetForm";
import { AssetTopbar, HandoverStatusBadge } from "./AssetParts";
import {
  handoverPdfUrl,
  handoverScanUrl,
  type HandoverItem,
} from "./asset-types";

type Dialog = "accept" | "cancel" | "return" | null;

export function HandoverView({
  handover,
  isRecipient,
  canManage,
  canViewRegister,
  issued,
}: {
  handover: HandoverItem;
  isRecipient: boolean;
  canManage: boolean;
  canViewRegister: boolean;
  issued: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [place, setPlace] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [location, setLocation] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const company = handover.company.legalName;
  const withCompany = (text: string) => text.replaceAll("{company}", company);
  const canAccept = isRecipient && handover.status === "pending";

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/assets/handovers/${encodeURIComponent(handover.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      setDialog(null);
      setNotice(done);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadScan(file: File) {
    setError("");
    setNotice("");
    if (!isAssetContentType(file.type))
      return setError(t("assetError_assetFileType"));
    if (file.size > ASSET_MAX_BYTES)
      return setError(t("assetError_assetFileTooLarge"));
    const body = new FormData();
    body.set("file", file);
    setBusy(true);
    try {
      const response = await appCheckFetch(handoverScanUrl(handover.id), {
        method: "PUT",
        body,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      setNotice(t("handoverScanSaved"));
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  const closeDialog = () => {
    setDialog(null);
    setError("");
  };

  return (
    <>
      <AssetTopbar
        title={t("assetReceiptTitleShort")}
        description={`${handover.recipientName} · ${handover.issuedOn}`}
      >
        <div className="actions">
          <Link
            className="button secondary"
            href={
              !canViewRegister
                ? "/assets/mine"
                : handover.lines.length === 1
                  ? `/assets/${encodeURIComponent(handover.lines[0]!.assetId)}`
                  : "/assets"
            }
          >
            {t("back")}
          </Link>
          <a className="button secondary" href={handoverPdfUrl(handover.id)}>
            {t("handoverDownloadPdf")}
          </a>
        </div>
      </AssetTopbar>
      {issued && (
        <p className="notice notice-success" role="status">
          {t("handoverIssued")}
        </p>
      )}
      {notice && (
        <p className="notice notice-success" role="status">
          {notice}
        </p>
      )}
      {canAccept && (
        <p className="notice notice-warning">{t("handoverPleaseAccept")}</p>
      )}
      {error && !dialog && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <section className="card handover-paper">
        <div className="handover-paper-status">
          <HandoverStatusBadge status={handover.status} />
        </div>
        <h2>{t("assetReceiptTitle")}</h2>
        <dl className="handover-fields">
          <div>
            <dt>{t("assetReceiptCompany")}</dt>
            <dd>{company}</dd>
          </div>
          <div>
            <dt>{t("assetReceiptOrgNumber")}</dt>
            <dd>{handover.company.orgNumber || "—"}</dd>
          </div>
          <div>
            <dt>{t("assetReceiptRecipient")}</dt>
            <dd>{handover.recipientName}</dd>
          </div>
          {handover.includePersonalNumber && (
            <div>
              <dt>{t("assetReceiptPersonalNumber")}</dt>
              <dd className="muted">{t("handoverPersonalNumberOnPdf")}</dd>
            </div>
          )}
          <div>
            <dt>{t("date")}</dt>
            <dd>{handover.issuedOn}</dd>
          </div>
        </dl>
        <h3>{t("assetReceiptIssuedEquipment")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("assetReceiptEquipment")}</th>
                <th>{t("assetReceiptMakeModel")}</th>
                <th>{t("assetReceiptSerialNumber")}</th>
                <th>{t("assetAccessories")}</th>
              </tr>
            </thead>
            <tbody>
              {handover.lines.map((line) => (
                <tr key={line.assetId}>
                  <td>
                    {canViewRegister ? (
                      <Link
                        href={`/assets/${encodeURIComponent(line.assetId)}`}
                      >
                        {line.equipment}
                      </Link>
                    ) : (
                      line.equipment
                    )}
                  </td>
                  <td>{line.makeModel || "—"}</td>
                  <td>{line.serialNumber || "—"}</td>
                  <td>{line.accessories || t("assetReceiptNoAccessories")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>{t("assetReceiptTerms")}</h3>
        <ul className="handover-terms">
          {ASSET_TERM_KEYS.map((key) => (
            <li key={key}>{withCompany(t(key))}</li>
          ))}
        </ul>
        <h3>{t("assetReceiptConfirmation")}</h3>
        <p>{withCompany(t("assetReceiptConfirmationText"))}</p>
        {handover.status !== "pending" && handover.acceptedOn && (
          <dl className="handover-fields">
            <div>
              <dt>{t("assetReceiptPlaceAndDate")}</dt>
              <dd>
                {handover.acceptedOn} {handover.acceptedPlace}
              </dd>
            </div>
            <div>
              <dt>{t("assetReceiptSignature")}</dt>
              <dd>
                {t("assetReceiptSignedElectronically")
                  .replace("{name}", handover.recipientName)
                  .replace(
                    "{dateTime}",
                    handover.acceptedAt
                      ? new Date(handover.acceptedAt).toLocaleString("sv-SE", {
                          timeZone: "Europe/Stockholm",
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : handover.acceptedOn,
                  )}
              </dd>
            </div>
          </dl>
        )}
        {canAccept && (
          <div className="handover-accept">
            <div className="form-grid">
              <label>
                {t("handoverPlace")}
                <InfoTip text={t("handoverPlaceTip")} />
                <input
                  className="field"
                  maxLength={80}
                  value={place}
                  placeholder={t("handoverPlacePlaceholder")}
                  onChange={(event) => setPlace(event.target.value)}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>{t("handoverConfirmCheckbox")}</span>
            </label>
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={!confirmed || !place.trim()}
                onClick={() => setDialog("accept")}
              >
                {t("handoverAccept")}
              </button>
            </div>
          </div>
        )}
      </section>
      {canManage && (
        <section className="card">
          <h2>{t("handoverManage")}</h2>
          <div className="handover-manage">
            {canCancelHandover(handover) && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setDialog("cancel")}
              >
                {t("handoverCancel")}
              </button>
            )}
            {canReturnHandover(handover) && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setDialog("return")}
              >
                {t("handoverReturn")}
              </button>
            )}
          </div>
          {handover.status !== "cancelled" && (
            <fieldset className="attachment-fieldset">
              <legend>
                {t("handoverScan")} <InfoTip text={t("handoverScanTip")} />
              </legend>
              {handover.scan && (
                <ul className="attachment-list">
                  <li>
                    <span>{handover.scan.name}</span>
                    <FilePreviewAction
                      target={{
                        name: handover.scan.name,
                        contentType: handover.scan.contentType,
                        fileUrl: handoverScanUrl(handover.id),
                      }}
                    />
                  </li>
                </ul>
              )}
              <input
                className="field"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadScan(file);
                }}
              />
            </fieldset>
          )}
        </section>
      )}
      {dialog && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="handover-dialog-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="handover-dialog-title">
                  {t(
                    dialog === "accept"
                      ? "handoverAcceptTitle"
                      : dialog === "cancel"
                        ? "handoverCancelTitle"
                        : "handoverReturnTitle",
                  )}
                </h2>
                <p>
                  {t(
                    dialog === "accept"
                      ? "handoverAcceptQuestion"
                      : dialog === "cancel"
                        ? "handoverCancelQuestion"
                        : "handoverReturnQuestion",
                  ).replace("{name}", handover.recipientName)}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={closeDialog}
              >
                ×
              </button>
            </header>
            {dialog === "return" && (
              <label>
                {t("assetLocation")}
                <input
                  className="field"
                  maxLength={120}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeDialog}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={`button${dialog === "cancel" ? " danger" : ""}`}
                disabled={busy}
                onClick={() =>
                  dialog === "accept"
                    ? act(
                        {
                          action: "accept",
                          place: place.trim(),
                          confirm: true,
                        },
                        t("handoverAccepted"),
                      )
                    : dialog === "cancel"
                      ? act({ action: "cancel" }, t("handoverCancelled"))
                      : act(
                          { action: "return", location: location.trim() },
                          t("handoverReturned"),
                        )
                }
              >
                {busy
                  ? t("saving")
                  : t(
                      dialog === "accept"
                        ? "handoverAccept"
                        : dialog === "cancel"
                          ? "handoverCancel"
                          : "handoverReturn",
                    )}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
