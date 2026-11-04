"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import { AttachmentClip, AttachmentDownloads } from "../FinanceAttachments";
import { ActionIcon } from "@/components/ui/ActionIcon";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
} from "@/components/ui/DetailView";

export type VatSettlementRow = {
  id: string;
  paymentDate: string;
  periodFrom: string;
  periodTo: string;
  amountMinor: number;
  roundingMinor: number;
  reference: string;
  note: string;
  status: "active" | "reversed";
  reversalReason: string;
  attachments: Array<{ id: string; name: string; contentType: string }>;
};

export function VatSettlementHistory({
  settlements,
  locale,
  canEdit,
  canDelete,
}: {
  settlements: VatSettlementRow[];
  locale: "sv-SE" | "en-SE";
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [reversing, setReversing] = useState<VatSettlementRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<VatSettlementRow | null>(null);

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
              <th>{t("attachment")}</th>
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
                  {settlement.attachments.length ? (
                    <div className="table-attachment-clips">
                      {settlement.attachments.map((attachment) => (
                        <AttachmentClip
                          key={attachment.id}
                          entityType="vatSettlement"
                          entityId={settlement.id}
                          attachment={attachment}
                        />
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("viewDetails")}
                      title={t("viewDetails")}
                      onClick={() => setViewing(settlement)}
                    >
                      i
                    </button>
                    {canEdit && settlement.status === "active" && (
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/finance/vat-settlements/${encodeURIComponent(settlement.id)}/edit`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                    )}
                    {canDelete && settlement.status === "active" && (
                      <button
                        className="table-action table-action-danger icon-action"
                        type="button"
                        aria-label={t("reverseVatPayment")}
                        title={t("reverseVatPayment")}
                        onClick={() => {
                          setError("");
                          setReversing(settlement);
                        }}
                      >
                        <ActionIcon type="reverse" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {viewing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setViewing(null)}
        >
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vat-details-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("vatSettlementDetails")}</span>
                <h2 id="vat-details-title">
                  {viewing.periodFrom} {"\u2013"} {viewing.periodTo}
                </h2>
                <p className="detail-meta">
                  <span>
                    {t("paymentDate")} {viewing.paymentDate}
                  </span>
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setViewing(null)}
              >
                {"\u00d7"}
              </button>
            </header>
            <DetailSummary
              tone={viewing.status === "reversed" ? "negative" : "neutral"}
              tags={
                <DetailTag
                  tone={viewing.status === "reversed" ? "negative" : "neutral"}
                >
                  {t(viewing.status)}
                </DetailTag>
              }
              amount={formatSek(viewing.amountMinor, locale)}
            />
            <DetailSections>
              <DetailSection title={t("detailDetails")}>
                <DetailFacts
                  rows={[
                    [
                      t("vatPeriod"),
                      `${viewing.periodFrom} \u2013 ${viewing.periodTo}`,
                    ],
                    [t("paymentDate"), viewing.paymentDate],
                    [t("amount"), formatSek(viewing.amountMinor, locale)],
                    viewing.roundingMinor !== 0 && [
                      t("rounding"),
                      formatSek(viewing.roundingMinor, locale),
                    ],
                    [t("paymentReference"), viewing.reference || "\u2014"],
                  ]}
                />
              </DetailSection>
              {viewing.reversalReason && (
                <DetailSection title={t("reversalReason")}>
                  <p>{viewing.reversalReason}</p>
                </DetailSection>
              )}
            </DetailSections>
            {viewing.note && (
              <DetailSection title={t("internalNote")}>
                <p>{viewing.note}</p>
              </DetailSection>
            )}
            <AttachmentDownloads
              entityType="vatSettlement"
              entityId={viewing.id}
            />
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setViewing(null)}
              >
                {t("close")}
              </button>
            </footer>
          </section>
        </div>
      )}
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
