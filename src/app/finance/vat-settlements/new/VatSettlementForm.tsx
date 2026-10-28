"use client";

import { DateInput } from "@/components/ui/DateInput";
import { InfoTip } from "@/components/ui/InfoTip";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  formatSek,
  MAX_ROUNDING_MINOR,
  parseSek,
  parseSignedSek,
} from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  FinanceAttachments,
  processAttachmentWithAi,
  saveFinanceAttachmentChanges,
  type AiAttachmentSource,
} from "../../FinanceAttachments";
import {
  aiConversionText,
  aiCurrencyWarningLines,
  aiErrorNotice,
  AiNotices,
  type AiNotice,
} from "../../ai-notices";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function VatSettlementForm({
  payableMinor,
  locale,
  settlement,
  aiEnabled = false,
}: {
  payableMinor: number;
  locale: "sv-SE" | "en-SE";
  settlement?: {
    id: string;
    paymentDate: string;
    periodFrom: string;
    periodTo: string;
    amountMinor: number;
    roundingMinor: number;
    reference: string;
    note: string;
  };
  aiEnabled?: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    settlement?.paymentDate ?? today(),
  );
  const [amount, setAmount] = useState(
    settlement ? (settlement.amountMinor / 100).toFixed(2) : "",
  );
  const [rounding, setRounding] = useState(
    settlement?.roundingMinor
      ? (settlement.roundingMinor / 100).toFixed(2)
      : "",
  );
  const [periodFrom, setPeriodFrom] = useState(settlement?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(settlement?.periodTo ?? "");
  const [reference, setReference] = useState(settlement?.reference ?? "");
  const [note, setNote] = useState(settlement?.note ?? "");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiProcessedKeys, setAiProcessedKeys] = useState<string[]>([]);
  const [aiNotice, setAiNotice] = useState<AiNotice | null>(null);
  const [aiCurrencyWarning, setAiCurrencyWarning] = useState<string[] | null>(
    null,
  );

  async function processWithAi(
    source: AiAttachmentSource,
    key: string,
    name: string,
  ) {
    setAiBusyKey(key);
    setAiNotice(null);
    setAiCurrencyWarning(null);
    const result = await processAttachmentWithAi(source, "vatSettlement");
    setAiBusyKey(null);
    const extraction = result.extraction;
    if (!extraction) {
      setAiNotice(aiErrorNotice(result, t));
      return;
    }
    setAiProcessedKeys((keys) => [...keys, key]);
    let filled = 0;
    const paid = extraction.date ?? extraction.dueDate;
    if (paid) {
      setPaymentDate(paid);
      filled++;
    }
    if (extraction.periodFrom && extraction.periodTo) {
      setPeriodFrom(extraction.periodFrom);
      setPeriodTo(extraction.periodTo);
      filled++;
    }
    if (
      extraction.currency === "SEK" &&
      extraction.grossMinor !== null &&
      extraction.grossMinor > 0
    ) {
      setAmount((extraction.grossMinor / 100).toFixed(2));
      filled++;
    }
    if (extraction.paymentReference) {
      setReference(extraction.paymentReference);
      filled++;
    }
    const conversionText = aiConversionText(extraction, t, locale);
    const summary = [extraction.description, conversionText]
      .filter(Boolean)
      .join(" - ");
    if (summary && !note.trim()) {
      setNote(summary);
      filled++;
    }
    setAiCurrencyWarning(aiCurrencyWarningLines(extraction, conversionText, t));
    if (!filled) {
      setAiNotice({
        tone: "warning",
        messages: [
          t("aiNothingFound").replace("{name}", name),
          ...(extraction.documentType === "vatDocument"
            ? []
            : [t("aiNotVatDocument").replace("{name}", name)]),
        ],
      });
      return;
    }
    setAiNotice({
      tone: "success",
      messages: [
        t("aiFilledFromFile").replace("{name}", name),
        ...(extraction.documentType === "vatDocument"
          ? []
          : [t("aiNotVatDocument").replace("{name}", name)]),
      ],
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let amountMinor: number;
    let roundingMinor: number;
    try {
      amountMinor = parseSek(amount);
      roundingMinor = parseSignedSek(rounding);
    } catch {
      setError(t("financeError_invalidInput"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: settlement ? "updateVatSettlement" : "createVatSettlement",
          ...(settlement ? { settlementId: settlement.id } : {}),
          paymentDate,
          periodFrom,
          periodTo,
          amountMinor,
          roundingMinor,
          reference,
          note,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
      };
      if (!response.ok) {
        setError(
          t(
            `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return;
      }
      const upload = await saveFinanceAttachmentChanges(
        "vatSettlement",
        settlement?.id ?? result.id ?? "",
        attachmentFiles,
        removedAttachmentIds,
      );
      if (!upload.ok) {
        setError(
          t(
            `financeError_${upload.error ?? "attachmentUploadFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return;
      }
      router.push("/finance/vat-settlements");
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="notice form-wide">
        {t("currentVatPayable")}: {formatSek(payableMinor, locale)}
      </p>
      <label>
        {t("paymentDate")}
        <InfoTip text={t("vatPaymentDateTip")} />
        <DateInput
          className="field"
          name="paymentDate"
          value={paymentDate}
          onChange={(event) => setPaymentDate(event.target.value)}
          required
        />
      </label>
      <label>
        {t("vatPaymentAmount")}
        <InfoTip text={t("vatPaymentAmountTip")} />
        <input
          className="field"
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label>
        {t("vatPeriodFrom")}
        <InfoTip text={t("vatPeriodFromTip")} />
        <DateInput
          className="field"
          name="periodFrom"
          value={periodFrom}
          max={periodTo || undefined}
          onChange={(event) => setPeriodFrom(event.target.value)}
          required
        />
      </label>
      <label>
        {t("vatPeriodTo")}
        <InfoTip text={t("vatPeriodToTip")} />
        <DateInput
          className="field"
          name="periodTo"
          value={periodTo}
          min={periodFrom || undefined}
          onChange={(event) => setPeriodTo(event.target.value)}
          required
        />
      </label>
      <label>
        {t("roundingSek")}
        <InfoTip text={t("vatRoundingTip")} />
        <input
          className="field"
          type="number"
          min={-MAX_ROUNDING_MINOR / 100}
          max={MAX_ROUNDING_MINOR / 100}
          step="0.01"
          value={rounding}
          placeholder="0.00"
          onChange={(event) => setRounding(event.target.value)}
        />
      </label>
      <label>
        {t("paymentReference")}
        <InfoTip text={t("paymentReferenceTip")} />
        <input
          className="field"
          name="reference"
          maxLength={120}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      <label className="form-wide">
        {t("internalNote")}
        <InfoTip text={t("vatNoteTip")} />
        <textarea
          className="field"
          name="note"
          rows={4}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <FinanceAttachments
        entityType="vatSettlement"
        entityId={settlement?.id}
        files={attachmentFiles}
        onFilesChange={setAttachmentFiles}
        removedAttachmentIds={removedAttachmentIds}
        onRemovedAttachmentIdsChange={setRemovedAttachmentIds}
        ai={
          aiEnabled
            ? {
                busyKey: aiBusyKey,
                processedKeys: aiProcessedKeys,
                onProcess: processWithAi,
              }
            : undefined
        }
      />
      <AiNotices notice={aiNotice} currencyWarning={aiCurrencyWarning} />
      {error && <p className="notice notice-error form-wide">{error}</p>}
      <div className="actions form-wide">
        <button
          className="button"
          disabled={busy || aiBusyKey !== null || payableMinor <= 0}
        >
          {busy
            ? t("saving")
            : settlement
              ? t("saveChanges")
              : t("recordVatPayment")}
        </button>
      </div>
    </form>
  );
}
