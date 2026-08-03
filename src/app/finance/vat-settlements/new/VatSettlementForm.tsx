"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek, parseSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function VatSettlementForm({
  payableMinor,
  locale,
}: {
  payableMinor: number;
  locale: "sv-SE" | "en-SE";
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createVatSettlement",
          paymentDate: form.get("paymentDate"),
          periodFrom: form.get("periodFrom"),
          periodTo: form.get("periodTo"),
          amountMinor: parseSek(String(form.get("amount"))),
          reference: form.get("reference"),
          note: form.get("note"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
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
        <input
          className="field"
          name="paymentDate"
          type="date"
          defaultValue={today()}
          required
        />
      </label>
      <label>
        {t("vatPaymentAmount")}
        <input
          className="field"
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          required
        />
      </label>
      <label>
        {t("vatPeriodFrom")}
        <input className="field" name="periodFrom" type="date" required />
      </label>
      <label>
        {t("vatPeriodTo")}
        <input className="field" name="periodTo" type="date" required />
      </label>
      <label className="form-wide">
        {t("paymentReference")}
        <input className="field" name="reference" maxLength={120} />
      </label>
      <label className="form-wide">
        {t("internalNote")}
        <textarea className="field" name="note" rows={4} maxLength={500} />
      </label>
      {error && <p className="notice notice-error form-wide">{error}</p>}
      <div className="actions form-wide">
        <button className="button" disabled={busy || payableMinor <= 0}>
          {busy ? t("saving") : t("recordVatPayment")}
        </button>
      </div>
    </form>
  );
}
