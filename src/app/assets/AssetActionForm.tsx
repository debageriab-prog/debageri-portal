"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { DateInput } from "@/components/ui/DateInput";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ASSET_RETIRE_STATUSES,
  type AssetBuyerType,
  type AssetRetireStatus,
} from "@/domain/assets";
import { parseSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import { assetErrorKey } from "./AssetForm";
import type { AssetItem } from "./asset-types";

type Mode = "holder" | "sell" | "retire";

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );

/** Moving equipment to the office or someone outside, selling or retiring it. */
export function AssetActionForm({
  asset,
  mode,
  users = [],
}: {
  asset: AssetItem;
  mode: Mode;
  /** People who can buy the equipment, for a sale. */
  users?: { id: string; name: string }[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [holderType, setHolderType] = useState<"company" | "external">(
    asset.holder.type === "external" ? "external" : "company",
  );
  const [buyerType, setBuyerType] = useState<AssetBuyerType>(
    asset.holder.type === "user" ? "user" : "external",
  );
  const [buyerUserId, setBuyerUserId] = useState(asset.holder.userId ?? "");
  const [retireStatus, setRetireStatus] =
    useState<AssetRetireStatus>("disposed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backHref = "/assets";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    let payload: Record<string, unknown>;
    if (mode === "holder") {
      if (holderType === "external" && !value("name"))
        return setError(t("assetError_nameRequired"));
      payload = {
        action: "holder",
        type: holderType,
        name: holderType === "external" ? value("name") : "",
        location: value("location"),
        note: value("note"),
      };
    } else if (mode === "sell") {
      let priceMinor: number;
      try {
        priceMinor = parseSek(value("price") || "0");
      } catch {
        return setError(t("assetError_invalidPrice"));
      }
      if (buyerType === "user" ? !buyerUserId : !value("buyerName"))
        return setError(t("assetError_buyerRequired"));
      payload = {
        action: "sell",
        date: value("date"),
        priceMinor,
        buyerType,
        buyerUserId: buyerType === "user" ? buyerUserId : null,
        buyerName: buyerType === "external" ? value("buyerName") : "",
        note: value("note"),
      };
    } else
      payload = {
        action: "retire",
        status: retireStatus,
        date: value("date"),
        note: value("note"),
      };
    if (mode !== "holder" && !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)))
      return setError(t("assetError_dateRequired"));
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/assets/${encodeURIComponent(asset.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      router.push(`${backHref}?saved=1`);
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
        {mode === "holder" && (
          <>
            <fieldset className="receipt-decision form-wide">
              <legend>
                {t("assetHolder")} <InfoTip text={t("assetHolderTip")} />
              </legend>
              {(["company", "external"] as const).map((type) => (
                <label className="checkbox-row" key={type}>
                  <input
                    type="radio"
                    name="holderType"
                    checked={holderType === type}
                    onChange={() => setHolderType(type)}
                  />
                  <span>{t(`assetHolder_${type}`)}</span>
                </label>
              ))}
            </fieldset>
            {holderType === "external" && (
              <label>
                {t("name")}
                <input
                  className="field"
                  name="name"
                  maxLength={120}
                  required
                  defaultValue={
                    asset.holder.type === "external" ? asset.holder.name : ""
                  }
                />
              </label>
            )}
            <label>
              {t("assetLocation")}
              <input
                className="field"
                name="location"
                maxLength={120}
                defaultValue={asset.holder.location}
              />
            </label>
          </>
        )}
        {mode === "sell" && (
          <>
            <fieldset className="receipt-decision form-wide">
              <legend>{t("assetBuyer")}</legend>
              {(["user", "external"] as const).map((type) => (
                <label className="checkbox-row" key={type}>
                  <input
                    type="radio"
                    name="buyerType"
                    checked={buyerType === type}
                    onChange={() => setBuyerType(type)}
                  />
                  <span>{t(`assetBuyer_${type}`)}</span>
                </label>
              ))}
            </fieldset>
            {buyerType === "user" ? (
              <label>
                {t("assetBuyer")}
                <select
                  className="field"
                  required
                  value={buyerUserId}
                  onChange={(event) => setBuyerUserId(event.target.value)}
                >
                  <option value="">{t("select")}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {t("assetBuyerName")}
                <input
                  className="field"
                  name="buyerName"
                  maxLength={120}
                  required
                />
              </label>
            )}
            <label>
              {t("assetSalePriceSek")}
              <InfoTip text={t("assetSalePriceTip")} />
              <input
                className="field"
                name="price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
              />
            </label>
          </>
        )}
        {mode === "retire" && (
          <label>
            {t("assetRetireReason")}
            <select
              className="field"
              value={retireStatus}
              onChange={(event) =>
                setRetireStatus(event.target.value as AssetRetireStatus)
              }
            >
              {ASSET_RETIRE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`assetStatus_${status}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode !== "holder" && (
          <label>
            {t("date")}
            <DateInput
              className="field"
              name="date"
              defaultValue={today()}
              required
            />
          </label>
        )}
        <label className="form-wide">
          {t("assetNote")}
          <textarea className="field" name="note" rows={3} maxLength={500} />
        </label>
      </div>
      {mode === "sell" && asset.handoverStatus === "accepted" && (
        <p className="notice notice-warning">{t("assetSellClosesHandover")}</p>
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
          onClick={() => router.push(backHref)}
        >
          {t("cancel")}
        </button>
        <button
          className={`button${mode === "holder" ? "" : " danger"}`}
          disabled={busy}
        >
          {busy
            ? t("saving")
            : t(
                mode === "holder"
                  ? "saveChanges"
                  : mode === "sell"
                    ? "assetSell"
                    : "assetRetire",
              )}
        </button>
      </footer>
    </form>
  );
}
