"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek } from "@/domain/finance/calculations";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { FileAddIcon } from "@/components/ui/FileActionIcons";
import {
  canBecomeExpense,
  filterReceipts,
  type ReceiptStatus,
} from "@/domain/receipts";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  personLabel,
  ReceiptDetailModal,
  ReceiptFilters,
  ReceiptStatusBadge,
  type ReceiptItem,
} from "./ReceiptParts";

const expenseHref = (receipt: ReceiptItem) =>
  `/finance/transactions/new?receiptId=${encodeURIComponent(receipt.id)}`;

export function ReceiptReview({
  receipts,
  people,
  currentPeriod,
}: {
  receipts: ReceiptItem[];
  people: { id: string; name: string; employeeNumber: string }[];
  currentPeriod: string;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [period, setPeriod] = useState<string | null>(null);
  const [status, setStatus] = useState<ReceiptStatus | "all">("pending");
  const [personFilter, setPersonFilter] = useState("");
  const [viewing, setViewing] = useState<ReceiptItem | null>(null);
  const [reviewing, setReviewing] = useState<ReceiptItem | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [askExpense, setAskExpense] = useState<ReceiptItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = filterReceipts(receipts, {
    period,
    status,
    userId: personFilter,
  });

  function openReview(receipt: ReceiptItem) {
    setError("");
    setDecision(receipt.status === "rejected" ? "rejected" : "approved");
    setReviewing(receipt);
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) return;
    const note = String(new FormData(event.currentTarget).get("note") ?? "");
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/receipts/${encodeURIComponent(reviewing.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: decision, note }),
      },
    ).catch(() => null);
    const result = (await response?.json().catch(() => ({}))) as
      { error?: string } | undefined;
    setBusy(false);
    if (!response?.ok)
      return setError(
        result?.error === "receiptExpenseLinked"
          ? t("receiptError_receiptExpenseLinked")
          : t("receiptError_receiptReviewFailed"),
      );
    const reviewed = { ...reviewing, status: decision, reviewNote: note };
    setReviewing(null);
    router.refresh();
    if (decision === "approved") setAskExpense(reviewed);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("receipts")}</div>
          <h1>{t("receipts")}</h1>
          <p className="muted page-description">
            {t("reviewReceiptsDescription")}
          </p>
        </div>
      </div>
      {error && !reviewing && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <ReceiptFilters
        period={period}
        onPeriodChange={setPeriod}
        defaultPeriod={currentPeriod}
        status={status}
        onStatusChange={setStatus}
      >
        <label>
          {t("employee")}
          <select
            className="field"
            value={personFilter}
            onChange={(event) => setPersonFilter(event.target.value)}
          >
            <option value="">{t("allEmployees")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person.name, person.employeeNumber)}
              </option>
            ))}
          </select>
        </label>
      </ReceiptFilters>
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noReceipts")}</h2>
            <p>{t("noReceiptsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("receiptDate")}</th>
                <th>{t("employee")}</th>
                <th>{t("receiptName")}</th>
                <th className="amount-heading">{t("totalIncludingVat")}</th>
                <th>{t("status")}</th>
                <th>{t("expense")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.date}</td>
                  <td>
                    {personLabel(receipt.userName, receipt.employeeNumber)}
                  </td>
                  <td>
                    <strong>{receipt.name}</strong>
                  </td>
                  <td className="amount-cell">
                    {formatSek(receipt.netMinor + receipt.vatMinor, locale)}
                  </td>
                  <td>
                    <ReceiptStatusBadge status={receipt.status} />
                  </td>
                  <td>
                    {receipt.expenseTransactionId
                      ? t("receiptExpenseBooked")
                      : "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action icon-action"
                        aria-label={t("viewReceipt")}
                        title={t("viewReceipt")}
                        onClick={() => setViewing(receipt)}
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                      <button
                        className="table-action icon-action"
                        aria-label={t("changeReceiptStatus")}
                        title={
                          receipt.expenseTransactionId
                            ? t("receiptError_receiptExpenseLinked")
                            : t("changeReceiptStatus")
                        }
                        disabled={Boolean(receipt.expenseTransactionId)}
                        onClick={() => openReview(receipt)}
                      >
                        <ActionIcon type="edit" />
                      </button>
                      {canBecomeExpense(receipt) && (
                        <button
                          className="table-action icon-action receipt-expense-action"
                          aria-label={t("addReceiptAsExpense")}
                          title={t("addReceiptAsExpense")}
                          onClick={() => router.push(expenseHref(receipt))}
                        >
                          <FileAddIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {viewing && (
        <ReceiptDetailModal
          receipt={viewing}
          showPerson
          onClose={() => setViewing(null)}
        />
      )}
      {reviewing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-review-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="receipt-review-title">{t("changeReceiptStatus")}</h2>
                <p>
                  {reviewing.name} ·{" "}
                  {personLabel(reviewing.userName, reviewing.employeeNumber)} ·{" "}
                  {reviewing.date}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setReviewing(null)}
              >
                ×
              </button>
            </header>
            <form className="receipt-review-form" onSubmit={review}>
              <fieldset className="receipt-decision">
                <legend>{t("status")}</legend>
                {(["approved", "rejected"] as const).map((value) => (
                  <label className="checkbox-row" key={value}>
                    <input
                      type="radio"
                      name="decision"
                      value={value}
                      checked={decision === value}
                      onChange={() => setDecision(value)}
                    />
                    <span>
                      <strong>{t(`receiptStatus_${value}`)}</strong>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                {t("receiptReviewNoteOptional")}
                <textarea
                  className="field"
                  name="note"
                  rows={3}
                  maxLength={500}
                  defaultValue={reviewing.reviewNote}
                />
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
                  onClick={() => setReviewing(null)}
                >
                  {t("cancel")}
                </button>
                <button className="button" disabled={busy}>
                  {busy ? t("saving") : t("save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {askExpense && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="receipt-expense-title"
            aria-describedby="receipt-expense-description"
          >
            <header className="modal-header">
              <div>
                <h2 id="receipt-expense-title">
                  {t("addReceiptAsExpenseTitle")}
                </h2>
                <p id="receipt-expense-description">
                  {t("addReceiptAsExpenseQuestion")
                    .replace("{name}", askExpense.name)
                    .replace("{person}", askExpense.userName)}
                </p>
              </div>
            </header>
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setAskExpense(null)}
              >
                {t("notNow")}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => router.push(expenseHref(askExpense))}
              >
                {t("yesAddExpense")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
