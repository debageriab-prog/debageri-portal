"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";

export type VatSettlementRow = {
  id: string;
  paymentDate: string;
  periodFrom: string;
  periodTo: string;
  amountMinor: number;
  reference: string;
  note: string;
  status: "active" | "reversed";
  reversalReason: string;
};

export function VatSettlementHistory({
  settlements,
  locale,
}: {
  settlements: VatSettlementRow[];
  locale: "sv-SE" | "en-SE";
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [reversing, setReversing] = useState<VatSettlementRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reversing) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reverseVatSettlement",
          settlementId: reversing.id,
          reason: form.get("reason"),
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
      setReversing(null);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  if (settlements.length === 0)
    return (
      <section className="card empty-state">{t("noVatSettlements")}</section>
    );

  return (
    <>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("paymentDate")}</th>
              <th>{t("vatPeriod")}</th>
              <th>{t("amount")}</th>
              <th>{t("paymentReference")}</th>
              <th>{t("internalNote")}</th>
              <th>{t("status")}</th>
              <th>{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((settlement) => (
              <tr key={settlement.id}>
                <td>{settlement.paymentDate}</td>
                <td>
                  {settlement.periodFrom} – {settlement.periodTo}
                </td>
                <td>{formatSek(settlement.amountMinor, locale)}</td>
                <td>{settlement.reference || "—"}</td>
                <td>
                  {settlement.status === "reversed"
                    ? settlement.reversalReason
                    : settlement.note || "—"}
                </td>
                <td>
                  <span
                    className={`vat-settlement-status status-${settlement.status}`}
                  >
                    {t(settlement.status)}
                  </span>
                </td>
                <td>
                  {settlement.status === "active" && (
                    <button
                      className="table-action table-action-danger"
                      type="button"
                      onClick={() => {
                        setError("");
                        setReversing(settlement);
                      }}
                    >
                      {t("reverseVatPayment")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {reversing && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            onSubmit={reverse}
          >
            <header className="modal-header">
              <div>
                <h2>{t("reverseVatPayment")}</h2>
                <p>{t("reverseVatPaymentDescription")}</p>
              </div>
            </header>
            <label>
              {t("reversalReason")}
              <textarea
                className="field"
                name="reason"
                rows={4}
                minLength={3}
                maxLength={300}
                required
              />
            </label>
            {error && <p className="notice notice-error">{error}</p>}
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setReversing(null)}
              >
                {t("cancel")}
              </button>
              <button className="button danger" disabled={busy}>
                {busy ? t("saving") : t("reverseVatPayment")}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
