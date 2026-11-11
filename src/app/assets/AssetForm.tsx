"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { DateInput } from "@/components/ui/DateInput";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ASSET_CATEGORIES,
  ASSET_MAX_BYTES,
  ASSET_MAX_FILES,
  isAssetContentType,
  type AssetCategory,
} from "@/domain/assets";
import { parseSek } from "@/domain/finance/calculations";
import {
  DEFAULT_REQUEST_VAT_RATE_BPS,
  REQUEST_VAT_RATES_BPS,
} from "@/domain/requests";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import type { AssetFileItem, AssetItem } from "./asset-types";

export const assetErrors: Record<string, MessageKey> = {
  invalidInput: "assetError_invalidInput",
  forbidden: "assetError_forbidden",
  notFound: "assetError_notFound",
  assetFileTooLarge: "assetError_assetFileTooLarge",
  assetFileType: "assetError_assetFileType",
  assetFileEmpty: "assetError_assetFileType",
  assetTooManyFiles: "assetError_assetTooManyFiles",
  assetNotActive: "assetError_assetNotActive",
  assetNotAvailable: "assetError_assetNotAvailable",
  handoverOpen: "assetError_handoverOpen",
  handoverPending: "assetError_handoverPending",
  invalidRecipient: "assetError_invalidRecipient",
  invalidBuyer: "assetError_invalidBuyer",
  invalidTransition: "assetError_invalidTransition",
  invalidTransaction: "assetError_invalidTransaction",
  transactionLinked: "assetError_transactionLinked",
  invalidSignature: "assetError_invalidSignature",
};

/** The message for an API error code, or the general one. */
export function assetErrorKey(code: string | undefined): MessageKey {
  return assetErrors[code ?? ""] ?? "assetError_saveFailed";
}

/** An expense the new asset is created from, filling the purchase details. */
export type AssetSource = {
  id: string;
  date: string;
  grossMinor: number;
  vatRateBps: number;
  description: string;
  fileNames: string[];
};

export function AssetForm({
  asset,
  people = [],
  source,
}: {
  /** The asset being edited; a new asset when left out. */
  asset?: AssetItem;
  /** Who can be chosen under In use by, for a new asset. */
  people?: { id: string; name: string }[];
  source?: AssetSource;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [category, setCategory] = useState<AssetCategory | "">(
    asset?.category ?? "",
  );
  const [price, setPrice] = useState(
    asset?.purchasePriceMinor
      ? (asset.purchasePriceMinor / 100).toFixed(2)
      : source?.grossMinor
        ? (source.grossMinor / 100).toFixed(2)
        : "",
  );
  const [vatRateBps, setVatRateBps] = useState<number>(
    asset?.vatRateBps ??
      (source &&
      (REQUEST_VAT_RATES_BPS as readonly number[]).includes(source.vatRateBps)
        ? source.vatRateBps
        : DEFAULT_REQUEST_VAT_RATE_BPS),
  );
  const [kept, setKept] = useState<AssetFileItem[]>(asset?.files ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inUseBy, setInUseBy] = useState("");
  const fileRoom =
    ASSET_MAX_FILES -
    kept.length -
    files.length -
    (source?.fileNames.length ?? 0);
  const backHref = asset
    ? `/assets/${encodeURIComponent(asset.id)}`
    : "/assets";

  function addFiles(selected: File[]) {
    setError("");
    if (selected.length > fileRoom)
      return setError(t("assetError_assetTooManyFiles"));
    if (selected.some((file) => !isAssetContentType(file.type)))
      return setError(t("assetError_assetFileType"));
    if (selected.some((file) => file.size > ASSET_MAX_BYTES))
      return setError(t("assetError_assetFileTooLarge"));
    setFiles((current) => [...current, ...selected]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return setError(t("assetError_categoryRequired"));
    let priceMinor: number;
    try {
      priceMinor = price.trim() ? parseSek(price) : 0;
    } catch {
      return setError(t("assetError_invalidPrice"));
    }
    const form = new FormData(event.currentTarget);
    const body = new FormData();
    for (const field of [
      "name",
      "make",
      "model",
      "serialNumber",
      "accessories",
      "supplier",
      "purchaseDate",
      "notes",
    ])
      body.set(field, String(form.get(field) ?? ""));
    body.set("category", category);
    body.set("purchasePriceMinor", String(priceMinor));
    body.set("vatRateBps", String(vatRateBps));
    if (!asset) body.set("inUseBy", inUseBy);
    if (source) body.set("purchaseTransactionId", source.id);
    for (const file of kept) body.append("keepFileIds", file.id);
    for (const file of files) body.append("files", file);
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        asset ? `/api/assets/${encodeURIComponent(asset.id)}` : "/api/assets",
        { method: asset ? "PUT" : "POST", body },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
      };
      if (!response.ok) return setError(t(assetErrorKey(result.error)));
      router.push(
        `/assets/${encodeURIComponent(result.id ?? asset?.id ?? "")}?saved=1`,
      );
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  const removeButton = (name: string, onClick: () => void) => (
    <button
      type="button"
      className="attachment-remove"
      aria-label={t("removeAttachment").replace("{name}", name)}
      title={t("removeAttachment").replace("{name}", name)}
      onClick={onClick}
    >
      <FileRemoveIcon />
    </button>
  );

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t("assetName")}
          <input
            className="field"
            name="name"
            required
            maxLength={120}
            autoFocus
            defaultValue={asset?.name ?? source?.description.slice(0, 120)}
            placeholder={t("assetNamePlaceholder")}
          />
        </label>
        <label>
          {t("assetCategory")}
          <select
            className="field"
            required
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as AssetCategory)
            }
          >
            <option value="">{t("select")}</option>
            {ASSET_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {t(`assetCategory_${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("assetMake")}
          <input
            className="field"
            name="make"
            maxLength={80}
            defaultValue={asset?.make}
          />
        </label>
        <label>
          {t("assetModel")}
          <input
            className="field"
            name="model"
            maxLength={120}
            defaultValue={asset?.model}
          />
        </label>
        <label>
          {t("assetSerialNumber")}
          <InfoTip text={t("assetSerialNumberTip")} />
          <input
            className="field"
            name="serialNumber"
            maxLength={120}
            defaultValue={asset?.serialNumber}
          />
        </label>
        <label>
          {t("assetAccessories")}
          <InfoTip text={t("assetAccessoriesTip")} />
          <input
            className="field"
            name="accessories"
            maxLength={300}
            defaultValue={asset?.accessories}
          />
        </label>
        <label>
          {t("assetPurchaseDate")}
          <DateInput
            className="field"
            name="purchaseDate"
            defaultValue={asset?.purchaseDate ?? source?.date ?? ""}
          />
        </label>
        <label>
          {t("assetSupplier")}
          <InfoTip text={t("assetSupplierTip")} />
          <input
            className="field"
            name="supplier"
            maxLength={120}
            defaultValue={asset?.supplier}
          />
        </label>
        <label>
          {t("assetPurchasePriceSek")}
          <InfoTip text={t("assetPurchasePriceTip")} />
          <input
            className="field"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label>
          {t("requestVatRate")}
          <select
            className="field"
            value={vatRateBps}
            onChange={(event) => setVatRateBps(Number(event.target.value))}
          >
            {REQUEST_VAT_RATES_BPS.map((rate) => (
              <option key={rate} value={rate}>
                {rate === 0 ? t("requestVatNone") : `${rate / 100} %`}
              </option>
            ))}
          </select>
        </label>
        {!asset && (
          <label>
            {t("assetHolder")}
            <InfoTip text={t("assetInUseByTip")} />
            <select
              className="field"
              value={inUseBy}
              onChange={(event) => setInUseBy(event.target.value)}
            >
              <option value="">{t("assetHolder_company")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-wide">
          {t("assetNotes")}
          <InfoTip text={t("assetNotesTip")} />
          <textarea
            className="field"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={asset?.notes}
          />
        </label>
        <fieldset className="attachment-fieldset form-wide">
          <legend>
            {t("assetFiles")} <InfoTip text={t("assetFilesTip")} />
          </legend>
          {source && source.fileNames.length > 0 && (
            <p className="muted">
              {t("assetFilesFromExpense").replace(
                "{files}",
                source.fileNames.join(", "),
              )}
            </p>
          )}
          {kept.length + files.length > 0 && (
            <ul className="attachment-list pending-attachment-list">
              {kept.map((file) => (
                <li key={file.id}>
                  <span>{file.name}</span>
                  {removeButton(file.name, () =>
                    setKept((current) =>
                      current.filter((item) => item.id !== file.id),
                    ),
                  )}
                </li>
              ))}
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <span>{file.name}</span>
                  {removeButton(file.name, () =>
                    setFiles((current) =>
                      current.filter((_, position) => position !== index),
                    ),
                  )}
                </li>
              ))}
            </ul>
          )}
          {fileRoom > 0 && (
            <input
              className="field"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                addFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
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
        <button className="button" disabled={busy}>
          {busy ? t("saving") : asset ? t("saveChanges") : t("assetCreate")}
        </button>
      </footer>
    </form>
  );
}
