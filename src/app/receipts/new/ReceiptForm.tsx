"use client";

import { DateInput } from "@/components/ui/DateInput";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import { formatSek, parseSek } from "@/domain/finance/calculations";
import { isReceiptContentType, RECEIPT_MAX_BYTES } from "@/domain/receipts";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";

const errors: Record<string, MessageKey> = {
  invalidInput: "receiptError_invalidInput",
  receiptFileRequired: "receiptError_receiptFileRequired",
  receiptFileTooLarge: "receiptError_receiptFileTooLarge",
  receiptFileType: "receiptError_receiptFileType",
};

export function ReceiptForm({ today }: { today: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [net, setNet] = useState("");
  const [vat, setVat] = useState("");
  const toMinor = (value: string) => {
    try {
      return value.trim() ? parseSek(value) : null;
    } catch {
      return null;
    }
  };
  const netMinor = toMinor(net);
  const vatMinor = toMinor(vat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function selectFile(selected: File | null) {
    setError("");
    if (!selected) return true;
    if (!isReceiptContentType(selected.type)) {
      setError(t("receiptError_receiptFileType"));
      return false;
    }
    if (selected.size > RECEIPT_MAX_BYTES) {
      setError(t("receiptError_receiptFileTooLarge"));
      return false;
    }
    setFile(selected);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError(t("receiptError_receiptFileRequired"));
    if (!netMinor || vatMinor === null)
      return setError(t("receiptError_invalidAmount"));
    if (vatMinor > netMinor) return setError(t("receiptError_vatTooHigh"));
    const form = new FormData(event.currentTarget);
    const body = new FormData();
    body.set("date", String(form.get("date") ?? ""));
    body.set("name", String(form.get("name") ?? ""));
    body.set("description", String(form.get("description") ?? ""));
    body.set("netMinor", String(netMinor));
    body.set("vatMinor", String(vatMinor));
    body.set("file", file);
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/receipts", {
        method: "POST",
        body,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          t(errors[result.error ?? ""] ?? "receiptError_receiptSaveFailed"),
        );
      router.push("/receipts?submitted=1");
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
          {t("receiptName")}
          <input
            className="field"
            name="name"
            required
            maxLength={120}
            autoFocus
            placeholder={t("receiptNamePlaceholder")}
          />
        </label>
        <label>
          {t("receiptDate")}
          <DateInput
            className="field"
            name="date"
            defaultValue={today}
            max={today}
            required
          />
        </label>
        <label>
          {t("totalExcludingVatSek")}
          <input
            className="field"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={net}
            onChange={(event) => setNet(event.target.value)}
            required
          />
        </label>
        <label>
          {t("vatAmountSek")}
          <input
            className="field"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={vat}
            onChange={(event) => setVat(event.target.value)}
            required
          />
        </label>
        <div
          className="transaction-amount-summary form-wide"
          aria-live="polite"
        >
          <div>
            <span>{t("totalIncludingVat")}</span>
            <strong>
              {formatSek((netMinor ?? 0) + (vatMinor ?? 0), locale)}
            </strong>
          </div>
        </div>
        <label className="form-wide">
          {t("descriptionOptional")}
          <textarea
            className="field"
            name="description"
            rows={3}
            maxLength={1000}
          />
        </label>
        <fieldset className="attachment-fieldset form-wide">
          <legend>{t("receiptFile")}</legend>
          <p className="muted">{t("receiptFileHelp")}</p>
          {file ? (
            <ul className="attachment-list pending-attachment-list">
              <li>
                <span>{file.name}</span>
                <button
                  type="button"
                  className="attachment-remove"
                  aria-label={t("removeAttachment").replace(
                    "{name}",
                    file.name,
                  )}
                  title={t("removeAttachment").replace("{name}", file.name)}
                  onClick={() => setFile(null)}
                >
                  <FileRemoveIcon />
                </button>
              </li>
            </ul>
          ) : (
            <input
              className="field"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                if (!selectFile(event.currentTarget.files?.[0] ?? null))
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
          onClick={() => router.push("/receipts")}
        >
          {t("cancel")}
        </button>
        <button className="button" disabled={busy || !file}>
          {busy ? t("uploading") : t("submitReceipt")}
        </button>
      </footer>
    </form>
  );
}
