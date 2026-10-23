"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { filterReceipts, type ReceiptStatus } from "@/domain/receipts";
import {
  ReceiptDetailModal,
  ReceiptFilters,
  ReceiptStatusBadge,
  type ReceiptItem,
} from "./ReceiptParts";

export function MyReceipts({
  receipts,
  currentPeriod,
  submitted,
}: {
  receipts: ReceiptItem[];
  currentPeriod: string;
  submitted: boolean;
}) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<string | null>(null);
  const [status, setStatus] = useState<ReceiptStatus | "all">("all");
  const [viewing, setViewing] = useState<ReceiptItem | null>(null);
  const filtered = filterReceipts(receipts, { period, status });
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("receipts")}</div>
          <h1>{t("myReceipts")}</h1>
          <p className="muted page-description">{t("myReceiptsDescription")}</p>
        </div>
        <Link className="button" href="/receipts/new">
          {t("uploadReceipt")}
        </Link>
      </div>
      {submitted && (
        <p className="notice notice-success" role="status">
          {t("receiptSubmitted")}
        </p>
      )}
      <ReceiptFilters
        period={period}
        onPeriodChange={setPeriod}
        defaultPeriod={currentPeriod}
        status={status}
        onStatusChange={setStatus}
      />
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noReceipts")}</h2>
            <p>{t("noOwnReceiptsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("receiptDate")}</th>
                <th>{t("receiptName")}</th>
                <th>{t("status")}</th>
                <th>{t("receiptReviewNote")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.date}</td>
                  <td>
                    <strong>{receipt.name}</strong>
                  </td>
                  <td>
                    <ReceiptStatusBadge status={receipt.status} />
                  </td>
                  <td className="receipt-note-cell">
                    {receipt.reviewNote || "—"}
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
          showPerson={false}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
