"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { DateInput } from "@/components/ui/DateInput";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import {
  FilePreviewAction,
  FilePreviewModal,
  PreviewButton,
  canPreview,
  type PreviewTarget,
} from "@/components/ui/FilePreview";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ASSET_CATEGORIES,
  ASSET_MAX_BYTES,
  ASSET_MAX_FILES,
  isAssetContentType,
  type AssetCategory,
} from "@/domain/assets";
import { formatSek, parseSek } from "@/domain/finance/calculations";
import {
  DEFAULT_REQUEST_VAT_RATE_BPS,
  REQUEST_VAT_RATES_BPS,
} from "@/domain/requests";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import type { AssetExtraction } from "@/domain/ai";
import { AiProcessButton } from "@/app/finance/FinanceAttachments";
import {
  AiNotices,
  aiErrorNotice,
  type AiNotice,
} from "@/app/finance/ai-notices";
import {
  assetFileUrl,
  type AssetFileItem,
  type AssetItem,
} from "./asset-types";

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
  files: { id: string; name: string; contentType: string }[];
};

/** Where an expense's file can be looked at before the asset exists. */
const expenseFileUrl = (transactionId: string, attachmentId: string) =>
  `/api/assets/expense-files/${encodeURIComponent(transactionId)}/${encodeURIComponent(attachmentId)}`;

/** Text fields the AI reading can fill in. */
type TextFields = Record<
  | "name"
  | "make"
  | "model"
  | "serialNumber"
  | "accessories"
  | "supplier"
  | "purchaseDate",
  string
>;

type AiTarget = { file: File } | { attachmentId: string };

export function AssetForm({
  asset,
  people = [],
  source,
  aiEnabled = false,
}: {
  /** Shows "Process attachment with AI" next to each file. */
  aiEnabled?: boolean;
  /** The asset being edited; a new asset when left out. */
  asset?: AssetItem;
  /** Who can be chosen under In use by, for a new asset. */
  people?: { id: string; name: string }[];
  source?: AssetSource;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [fields, setFields] = useState<TextFields>({
    name: asset?.name ?? source?.description.slice(0, 120) ?? "",
    make: asset?.make ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    accessories: asset?.accessories ?? "",
    supplier: asset?.supplier ?? "",
    purchaseDate: asset?.purchaseDate ?? source?.date ?? "",
  });
  const field = (key: keyof TextFields) => ({
    name: key,
    value: fields[key],
    onChange: (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value })),
  });
  const [sourceFiles, setSourceFiles] = useState(source?.files ?? []);
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiProcessedKeys, setAiProcessedKeys] = useState<string[]>([]);
  const [aiNotice, setAiNotice] = useState<AiNotice | null>(null);
  const [previewing, setPreviewing] = useState<PreviewTarget | null>(null);
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
    ASSET_MAX_FILES - kept.length - files.length - sourceFiles.length;
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

  /** Fills the form from an AI reading, keeping what it could not read. */
  function applyExtraction(extraction: AssetExtraction, name: string) {
    const found: Partial<TextFields> = {};
    if (extraction.name) found.name = extraction.name;
    if (extraction.make) found.make = extraction.make;
    if (extraction.model) found.model = extraction.model;
    if (extraction.serialNumber) found.serialNumber = extraction.serialNumber;
    if (extraction.accessories) found.accessories = extraction.accessories;
    if (extraction.supplier) found.supplier = extraction.supplier;
    if (extraction.date) found.purchaseDate = extraction.date;
    setFields((current) => ({ ...current, ...found }));
    let filled = Object.keys(found).length;
    if (extraction.category) {
      setCategory(extraction.category);
      filled++;
    }
    if (extraction.grossMinor !== null && extraction.currency === "SEK") {
      setPrice((extraction.grossMinor / 100).toFixed(2));
      filled++;
    }
    if (
      extraction.vatRateBps !== null &&
      (REQUEST_VAT_RATES_BPS as readonly number[]).includes(
        extraction.vatRateBps,
      )
    ) {
      setVatRateBps(extraction.vatRateBps);
      filled++;
    }
    if (!filled)
      return setAiNotice({
        tone: "warning",
        messages: [t("assetAiNothingFound").replace("{name}", name)],
      });
    const messages = [t("assetAiFilled").replace("{name}", name)];
    if (extraction.conversion)
      messages.push(
        t("assetAiConverted")
          .replace(
            "{amount}",
            (extraction.conversion.grossMinor / 100).toLocaleString(locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          )
          .replace("{currency}", extraction.conversion.currency)
          .replace("{sek}", formatSek(extraction.grossMinor ?? 0, locale)),
      );
    else if (extraction.currency !== "SEK")
      messages.push(
        t("assetAiForeignCurrency").replace("{currency}", extraction.currency),
      );
    setAiNotice({ tone: "success", messages });
  }

  async function processWithAi(target: AiTarget, key: string, name: string) {
    setAiBusyKey(key);
    setAiNotice(null);
    let init: RequestInit;
    if ("file" in target) {
      const body = new FormData();
      body.set("file", target.file);
      init = { method: "POST", body };
    } else
      init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionId: source?.id,
          attachmentId: target.attachmentId,
        }),
      };
    try {
      const response = await appCheckFetch("/api/assets/ai", init);
      const result = (await response.json().catch(() => ({}))) as {
        extraction?: AssetExtraction;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !result.extraction)
        return setAiNotice(aiErrorNotice(result, t));
      setAiProcessedKeys((keys) => [...keys, key]);
      applyExtraction(result.extraction, name);
    } catch {
      setAiNotice(aiErrorNotice({ error: "aiProviderFailed" }, t));
    } finally {
      setAiBusyKey(null);
    }
  }

  const aiButton = (
    target: AiTarget,
    key: string,
    name: string,
    contentType: string,
  ) =>
    aiEnabled && canPreview(contentType) ? (
      <AiProcessButton
        name={name}
        busy={aiBusyKey === key}
        disabled={aiBusyKey !== null}
        processed={aiProcessedKeys.includes(key)}
        onClick={() => void processWithAi(target, key, name)}
      />
    ) : null;

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
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    body.set("notes", String(form.get("notes") ?? ""));
    body.set("category", category);
    body.set("purchasePriceMinor", String(priceMinor));
    body.set("vatRateBps", String(vatRateBps));
    if (!asset) body.set("inUseBy", inUseBy);
    if (source) {
      body.set("purchaseTransactionId", source.id);
      for (const file of source.files)
        if (!sourceFiles.some((item) => item.id === file.id))
          body.append("skipSourceFileIds", file.id);
    }
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
            {...field("name")}
            required
            maxLength={120}
            autoFocus
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
          <input className="field" {...field("make")} maxLength={80} />
        </label>
        <label>
          {t("assetModel")}
          <input className="field" {...field("model")} maxLength={120} />
        </label>
        <label>
          {t("assetSerialNumber")}
          <InfoTip text={t("assetSerialNumberTip")} />
          <input className="field" {...field("serialNumber")} maxLength={120} />
        </label>
        <label>
          {t("assetAccessories")}
          <InfoTip text={t("assetAccessoriesTip")} />
          <input className="field" {...field("accessories")} maxLength={300} />
        </label>
        <label>
          {t("assetPurchaseDate")}
          <DateInput className="field" {...field("purchaseDate")} />
        </label>
        <label>
          {t("assetSupplier")}
          <InfoTip text={t("assetSupplierTip")} />
          <input className="field" {...field("supplier")} maxLength={120} />
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
          {sourceFiles.length + kept.length + files.length > 0 && (
            <ul className="attachment-list pending-attachment-list">
              {sourceFiles.map((file) => (
                <li key={`source-${file.id}`}>
                  <span>{file.name}</span>
                  <span className="detail-tag detail-tag-neutral">
                    {t("assetFileFromExpense")}
                  </span>
                  {aiButton(
                    { attachmentId: file.id },
                    `source-${file.id}`,
                    file.name,
                    file.contentType,
                  )}
                  <FilePreviewAction
                    target={{
                      name: file.name,
                      contentType: file.contentType,
                      fileUrl: expenseFileUrl(source!.id, file.id),
                    }}
                  />
                  {removeButton(file.name, () =>
                    setSourceFiles((current) =>
                      current.filter((item) => item.id !== file.id),
                    ),
                  )}
                </li>
              ))}
              {kept.map((file) => (
                <li key={file.id}>
                  <span>{file.name}</span>
                  {asset && (
                    <FilePreviewAction
                      target={{
                        name: file.name,
                        contentType: file.contentType,
                        fileUrl: assetFileUrl(asset.id, file.id),
                      }}
                    />
                  )}
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
                  {aiButton(
                    { file },
                    `file-${file.name}-${file.size}-${file.lastModified}`,
                    file.name,
                    file.type,
                  )}
                  {canPreview(file.type) && (
                    <PreviewButton
                      name={file.name}
                      onClick={() =>
                        setPreviewing({
                          name: file.name,
                          contentType: file.type,
                          blob: file,
                        })
                      }
                    />
                  )}
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
          <AiNotices notice={aiNotice} currencyWarning={null} />
          {previewing && (
            <FilePreviewModal
              target={previewing}
              onClose={() => setPreviewing(null)}
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
