"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import { DocumentPreview } from "@/components/ui/DocumentPreview";
import { MonthStepper } from "@/components/ui/MonthStepper";
import { RECEIPT_STATUSES, type ReceiptStatus } from "@/domain/receipts";

export type ReceiptItem = {
  id: string;
  userId: string;
  userName: string;
  employeeNumber: string;
  date: string;
  name: string;
  description: string;
  fileName: string;
  contentType: string;
  status: ReceiptStatus;
  reviewNote: string;
  expenseTransactionId: string | null;
  submittedAt: string;
};

export const receiptFileUrl = (id: string) =>
  `/api/receipts/${encodeURIComponent(id)}/file`;

export const personLabel = (name: string, employeeNumber: string) =>
  employeeNumber ? `${name} (${employeeNumber})` : name;

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const { t } = useLocale();
  const tone =
    status === "approved"
      ? " status-approved"
      : status === "rejected"
        ? " status-rejected"
        : "";
  return (
    <span className={`status${tone}`}>{t(`receiptStatus_${status}`)}</span>
  );
}

export function ReceiptFilters({
  period,
  onPeriodChange,
  defaultPeriod,
  status,
  onStatusChange,
  children,
}: {
  period: string | null;
  onPeriodChange: (period: string | null) => void;
  defaultPeriod: string;
  status: ReceiptStatus | "all";
  onStatusChange: (status: ReceiptStatus | "all") => void;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section className="card filters-card">
      <div className="form-grid">
        <div className="receipt-period-filter">
          <span>{t("period")}</span>
          <div className="actions">
            <select
              className="field finance-period"
              aria-label={t("periodType")}
              value={period ? "month" : "all"}
              onChange={(event) =>
                onPeriodChange(
                  event.target.value === "month" ? defaultPeriod : null,
                )
              }
            >
              <option value="all">{t("allTime")}</option>
              <option value="month">{t("month")}</option>
            </select>
            {period && (
              <MonthStepper
                value={period}
                label={t("payslipPeriod")}
                onChange={(value) => {
                  if (value) onPeriodChange(value);
                }}
              />
            )}
          </div>
        </div>
        {children}
        <label>
          {t("status")}
          <select
            className="field"
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as ReceiptStatus | "all")
            }
          >
            <option value="all">{t("allStatuses")}</option>
            {RECEIPT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`receiptStatus_${item}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export function ReceiptDetailModal({
  receipt,
  showPerson,
  onClose,
}: {
  receipt: ReceiptItem;
  showPerson: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal payslip-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t("receiptDetails")}</span>
            <h2 id="receipt-view-title">{receipt.name}</h2>
            {showPerson && (
              <p>{personLabel(receipt.userName, receipt.employeeNumber)}</p>
            )}
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <dl className="detail-grid receipt-detail-grid">
          <div>
            <dt>{t("receiptDate")}</dt>
            <dd>{receipt.date}</dd>
          </div>
          <div>
            <dt>{t("status")}</dt>
            <dd>
              <ReceiptStatusBadge status={receipt.status} />
            </dd>
          </div>
          {receipt.description && (
            <div className="receipt-detail-wide">
              <dt>{t("description")}</dt>
              <dd>{receipt.description}</dd>
            </div>
          )}
          {receipt.reviewNote && (
            <div className="receipt-detail-wide">
              <dt>{t("receiptReviewNote")}</dt>
              <dd>{receipt.reviewNote}</dd>
            </div>
          )}
          {receipt.expenseTransactionId && (
            <div className="receipt-detail-wide">
              <dt>{t("expense")}</dt>
              <dd>{t("receiptExpenseBooked")}</dd>
            </div>
          )}
        </dl>
        <DocumentPreview
          fileUrl={receiptFileUrl(receipt.id)}
          fileName={receipt.fileName}
          contentType={receipt.contentType}
          title={t("receiptPreviewTitle")}
        />
      </section>
    </div>
  );
}
