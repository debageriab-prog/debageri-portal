"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import { appCheckFetch } from "@/lib/firebase/client";
import { assetErrorKey } from "./AssetForm";
import type { AssetItem } from "./asset-types";

export type HandoverRecipient = { id: string; name: string };

/**
 * Hands one asset to a person: shows its items as they go on the receipt,
 * and asks who receives them and whether to print their personal number.
 */
export function HandoverModal({
  asset,
  recipients,
  onClose,
  onIssued,
}: {
  asset: AssetItem;
  /** People who can open their equipment and accept the receipt. */
  recipients: HandoverRecipient[];
  onClose: () => void;
  onIssued: () => void;
}) {
  const { t } = useLocale();
  const [recipientUserId, setRecipientUserId] = useState("");
  const [includePersonalNumber, setIncludePersonalNumber] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipientUserId) return setError(t("assetError_invalidRecipient"));
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/assets/handovers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientUserId,
          assetIds: [asset.id],
          includePersonalNumber,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      onIssued();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`handover-title-${asset.id}`}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t("handoverNew")}</span>
            <h2 id={`handover-title-${asset.id}`}>{asset.name}</h2>
            <p>{t("handoverNewDescription")}</p>
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
        <form className="handover-modal-form" onSubmit={submit}>
          <fieldset className="attachment-fieldset">
            <legend>{t("assetReceiptIssuedEquipment")}</legend>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("assetPartName")}</th>
                    <th>{t("assetReceiptMakeModel")}</th>
                    <th>{t("assetSerialNumber")}</th>
                    <th>{t("assetAccessories")}</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.parts.map((part, index) => (
                    <tr key={index}>
                      <td>{part.name || asset.name}</td>
                      <td>
                        {[part.make, part.model].filter(Boolean).join(" ") ||
                          "—"}
                      </td>
                      <td>{part.serialNumber || "—"}</td>
                      <td>{part.accessories || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          <label>
            <span>
              {t("assetReceiptRecipient")}{" "}
              <InfoTip text={t("handoverRecipientTip")} />
            </span>
            <select
              className="field"
              required
              autoFocus
              value={recipientUserId}
              onChange={(event) => setRecipientUserId(event.target.value)}
            >
              <option value="">{t("select")}</option>
              {recipients.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includePersonalNumber}
              onChange={(event) =>
                setIncludePersonalNumber(event.target.checked)
              }
            />
            <span>{t("handoverIncludePersonalNumber")}</span>
            <InfoTip text={t("handoverIncludePersonalNumberTip")} />
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
              onClick={onClose}
            >
              {t("cancel")}
            </button>
            <button className="button" disabled={busy}>
              {busy ? t("saving") : t("handoverSend")}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
