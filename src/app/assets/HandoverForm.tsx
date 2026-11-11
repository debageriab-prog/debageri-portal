"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import { appCheckFetch } from "@/lib/firebase/client";
import { assetErrorKey } from "./AssetForm";
import { useHolderLabel } from "./AssetParts";
import type { AssetItem } from "./asset-types";

export function HandoverForm({
  assets,
  recipients,
  selected,
}: {
  /** Active equipment nobody has been handed. */
  assets: AssetItem[];
  /** People who can open their equipment and accept the receipt. */
  recipients: { id: string; name: string }[];
  selected: string | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const holderLabel = useHolderLabel();
  const [recipientUserId, setRecipientUserId] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>(
    selected ? [selected] : [],
  );
  const [includePersonalNumber, setIncludePersonalNumber] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backHref = selected
    ? `/assets/${encodeURIComponent(selected)}`
    : "/assets/handovers";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipientUserId) return setError(t("assetError_invalidRecipient"));
    if (assetIds.length === 0) return setError(t("handoverPickAssets"));
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/assets/handovers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientUserId,
          assetIds,
          includePersonalNumber,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      router.push(
        `/assets/handovers/${encodeURIComponent(result.id!)}?issued=1`,
      );
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t("assetReceiptRecipient")}
          <InfoTip text={t("handoverRecipientTip")} />
          <select
            className="field"
            required
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
        <label className="checkbox-row handover-personal-number">
          <input
            type="checkbox"
            checked={includePersonalNumber}
            onChange={(event) => setIncludePersonalNumber(event.target.checked)}
          />
          <span>{t("handoverIncludePersonalNumber")}</span>
          <InfoTip text={t("handoverIncludePersonalNumberTip")} />
        </label>
        <fieldset className="attachment-fieldset form-wide">
          <legend>{t("assetReceiptIssuedEquipment")}</legend>
          {assets.length === 0 ? (
            <p className="muted">{t("handoverNoAvailableAssets")}</p>
          ) : (
            assets.map((asset) => (
              <label className="checkbox-row" key={asset.id}>
                <input
                  type="checkbox"
                  checked={assetIds.includes(asset.id)}
                  onChange={(event) =>
                    setAssetIds((current) =>
                      event.target.checked
                        ? [...current, asset.id]
                        : current.filter((id) => id !== asset.id),
                    )
                  }
                />
                <span>
                  <strong>{asset.name}</strong>
                  {[asset.make, asset.model, asset.serialNumber]
                    .filter(Boolean)
                    .map((part) => ` · ${part}`)
                    .join("")}
                  <span className="muted"> — {holderLabel(asset.holder)}</span>
                </span>
              </label>
            ))
          )}
        </fieldset>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => router.push(backHref)}
        >
          {t("cancel")}
        </button>
        <button className="button" disabled={busy || assets.length === 0}>
          {busy ? t("saving") : t("handoverSend")}
        </button>
      </footer>
    </form>
  );
}
