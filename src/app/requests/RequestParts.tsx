"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import {
  DetailFacts,
  DetailFile,
  DetailFiles,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
  type DetailTone,
} from "@/components/ui/DetailView";
import { FilePreviewAction } from "@/components/ui/FilePreview";
import { MonthStepper } from "@/components/ui/MonthStepper";
import { formatSek } from "@/domain/finance/calculations";
import {
  REQUEST_STATUSES,
  REQUEST_TYPES,
  type RequestPayer,
  type RequestStatus,
  type RequestType,
} from "@/domain/requests";

export type RequestFileItem = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

export type RequestHistoryItem = {
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  note: string;
  performedByName: string;
  performedAt: string;
};

export type RequestItem = {
  id: string;
  userId: string;
  userName: string;
  employeeNumber: string;
  type: RequestType;
  title: string;
  description: string;
  links: string[];
  estimatedCostMinor: number;
  payer: RequestPayer;
  /** Missing on requests sent before the VAT rate was asked for. */
  vatRateBps: number | null;
  startDate: string | null;
  endDate: string | null;
  files: RequestFileItem[];
  status: RequestStatus;
  reviewNote: string;
  expenseTransactionId: string | null;
  submittedOn: string;
  submittedAt: string;
  history: RequestHistoryItem[];
};

export const requestFileUrl = (requestId: string, fileId: string) =>
  `/api/requests/${encodeURIComponent(requestId)}/files/${encodeURIComponent(fileId)}`;

export const personLabel = (name: string, employeeNumber: string) =>
  employeeNumber ? `${name} (${employeeNumber})` : name;

const statusClass: Record<RequestStatus, string> = {
  requested: "",
  changes_requested: " status-changes",
  under_review: " status-vacation",
  accepted: " status-approved",
  rejected: " status-rejected",
  finalized: " status-active",
  withdrawn: " status-inactive",
};

const statusTone: Record<RequestStatus, DetailTone> = {
  requested: "neutral",
  changes_requested: "negative",
  under_review: "neutral",
  accepted: "positive",
  rejected: "negative",
  finalized: "positive",
  withdrawn: "neutral",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useLocale();
  return (
    <span className={`status${statusClass[status]}`}>
      {t(`requestStatus_${status}`)}
    </span>
  );
}

export function requestDates(item: {
  startDate: string | null;
  endDate: string | null;
}) {
  if (!item.startDate && !item.endDate) return "";
  if (item.startDate && item.endDate && item.startDate !== item.endDate)
    return `${item.startDate} – ${item.endDate}`;
  return item.startDate ?? item.endDate ?? "";
}

export function RequestFilters({
  period,
  onPeriodChange,
  defaultPeriod,
  status,
  onStatusChange,
  type,
  onTypeChange,
  children,
}: {
  period: string | null;
  onPeriodChange: (period: string | null) => void;
  defaultPeriod: string;
  status: RequestStatus | "all";
  onStatusChange: (status: RequestStatus | "all") => void;
  type: RequestType | "all";
  onTypeChange: (type: RequestType | "all") => void;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  const view = period === null ? "all" : period.length === 4 ? "year" : "month";
  return (
    <section className="card filters-card">
      <div className="form-grid">
        <div className="receipt-period-filter">
          <span>{t("period")}</span>
          <div className="actions">
            <select
              className="field finance-period"
              aria-label={t("periodType")}
              value={view}
              onChange={(event) => {
                const year = (period ?? defaultPeriod).slice(0, 4);
                if (event.target.value === "all") onPeriodChange(null);
                else if (event.target.value === "year") onPeriodChange(year);
                else
                  onPeriodChange(
                    year === defaultPeriod.slice(0, 4)
                      ? defaultPeriod
                      : `${year}-01`,
                  );
              }}
            >
              <option value="month">{t("month")}</option>
              <option value="year">{t("year")}</option>
              <option value="all">{t("allTime")}</option>
            </select>
            {view === "month" && period && (
              <MonthStepper
                value={period}
                label={t("payslipPeriod")}
                onChange={(value) => {
                  if (value) onPeriodChange(value);
                }}
              />
            )}
            {view === "year" && (
              <input
                className="field finance-period"
                type="number"
                min="2000"
                max="2100"
                aria-label={t("year")}
                key={period}
                defaultValue={period ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^\d{4}$/.test(value) && +value >= 2000 && +value <= 2100)
                    onPeriodChange(value);
                }}
              />
            )}
          </div>
        </div>
        {children}
        <label>
          {t("requestType")}
          <select
            className="field"
            value={type}
            onChange={(event) =>
              onTypeChange(event.target.value as RequestType | "all")
            }
          >
            <option value="all">{t("allRequestTypes")}</option>
            {REQUEST_TYPES.map((item) => (
              <option key={item} value={item}>
                {t(`requestType_${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("status")}
          <select
            className="field"
            value={status}
            onChange={(event) =>
              onStatusChange(event.target.value as RequestStatus | "all")
            }
          >
            <option value="all">{t("allStatuses")}</option>
            {REQUEST_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`requestStatus_${item}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export function RequestDetailModal({
  request,
  showPerson,
  onClose,
}: {
  request: RequestItem;
  showPerson: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const dates = requestDates(request);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal detail-modal detail-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t(`requestType_${request.type}`)}</span>
            <h2 id="request-view-title">{request.title}</h2>
            {showPerson && (
              <p>{personLabel(request.userName, request.employeeNumber)}</p>
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
        <DetailSummary
          tone={statusTone[request.status]}
          tags={
            <>
              <RequestStatusBadge status={request.status} />
              {request.expenseTransactionId && (
                <DetailTag tone="positive">
                  {t("requestExpenseBooked")}
                </DetailTag>
              )}
            </>
          }
          amount={formatSek(request.estimatedCostMinor, locale)}
          headline={`${t("requestSubmittedOn")} ${request.submittedOn}`}
        >
          {request.description}
        </DetailSummary>
        <DetailSections>
          <DetailSection title={t("requestDetails")}>
            <DetailFacts
              rows={[
                [t("requestType"), t(`requestType_${request.type}`)],
                [
                  t("requestEstimatedCost"),
                  formatSek(request.estimatedCostMinor, locale),
                ],
                [
                  t("requestVatRate"),
                  request.vatRateBps === null
                    ? ""
                    : `${request.vatRateBps / 100} %`,
                ],
                [t("requestPayer"), t(`requestPayer_${request.payer}`)],
                [t("requestDates"), dates],
              ]}
            />
          </DetailSection>
          {request.links.length > 0 && (
            <DetailSection
              title={t("requestLinks")}
              count={request.links.length}
            >
              <ul className="request-link-list">
                {request.links.map((link, index) => (
                  <li key={`${index}-${link}`}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link}
                    >
                      {t("requestLinkNumber").replace(
                        "{number}",
                        String(index + 1),
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
          {request.reviewNote && (
            <DetailSection title={t("requestReviewNote")}>
              <p>{request.reviewNote}</p>
            </DetailSection>
          )}
        </DetailSections>
        {request.files.length > 0 && (
          <DetailSection title={t("attachments")} count={request.files.length}>
            <DetailFiles>
              {request.files.map((file) => (
                <DetailFile
                  key={file.id}
                  name={file.name}
                  contentType={file.contentType}
                  size={file.size}
                >
                  <FilePreviewAction
                    target={{
                      name: file.name,
                      contentType: file.contentType,
                      fileUrl: requestFileUrl(request.id, file.id),
                    }}
                  />
                </DetailFile>
              ))}
            </DetailFiles>
          </DetailSection>
        )}
        {request.history.length > 0 && (
          <DetailSection title={t("requestHistory")}>
            <ol className="request-history">
              {request.history.map((event, index) => (
                <li key={`${event.performedAt}-${index}`}>
                  <RequestStatusBadge status={event.toStatus} />
                  <span className="muted">
                    {event.performedAt.slice(0, 10)} · {event.performedByName}
                  </span>
                  {event.note && <p>{event.note}</p>}
                </li>
              ))}
            </ol>
          </DetailSection>
        )}
      </section>
    </div>
  );
}
