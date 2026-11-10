"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { FileAddIcon } from "@/components/ui/FileActionIcons";
import { formatSek } from "@/domain/finance/calculations";
import {
  canBecomeExpense,
  filterRequests,
  nextStatuses,
  NOTE_REQUIRED_STATUSES,
  type RequestStatus,
  type RequestType,
} from "@/domain/requests";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import {
  personLabel,
  RequestDetailModal,
  RequestFilters,
  RequestStatusBadge,
  type RequestItem,
} from "./RequestParts";

const expenseHref = (request: RequestItem) =>
  `/finance/transactions/new?requestId=${encodeURIComponent(request.id)}`;

const errors: Record<string, MessageKey> = {
  invalidInput: "requestError_noteRequired",
  invalidTransition: "requestError_invalidTransition",
  ownRequest: "requestError_ownRequest",
};

export function RequestReview({
  requests,
  people,
  currentPeriod,
  actorId,
  canBook,
}: {
  requests: RequestItem[];
  people: { id: string; name: string; employeeNumber: string }[];
  currentPeriod: string;
  actorId: string;
  canBook: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [period, setPeriod] = useState<string | null>(currentPeriod);
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [type, setType] = useState<RequestType | "all">("all");
  const [personFilter, setPersonFilter] = useState("");
  const [viewing, setViewing] = useState<RequestItem | null>(null);
  const [reviewing, setReviewing] = useState<RequestItem | null>(null);
  const [decision, setDecision] = useState<RequestStatus | null>(null);
  const [askExpense, setAskExpense] = useState<RequestItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = filterRequests(requests, {
    period,
    status,
    type,
    userId: personFilter,
  });

  function openReview(request: RequestItem) {
    setError("");
    setDecision(null);
    setReviewing(request);
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing || !decision) return;
    const note = String(
      new FormData(event.currentTarget).get("note") ?? "",
    ).trim();
    if (NOTE_REQUIRED_STATUSES.includes(decision) && !note)
      return setError(t("requestError_noteRequired"));
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/requests/${encodeURIComponent(reviewing.id)}`,
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
        t(errors[result?.error ?? ""] ?? "requestError_requestStatusFailed"),
      );
    const reviewed = {
      ...reviewing,
      status: decision,
      reviewNote: note || reviewing.reviewNote,
    };
    setReviewing(null);
    router.refresh();
    if (canBook && canBecomeExpense(reviewed)) setAskExpense(reviewed);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("requests")}</div>
          <h1>{t("reviewRequests")}</h1>
          <p className="muted page-description">
            {t("reviewRequestsDescription")}
          </p>
        </div>
      </div>
      {error && !reviewing && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <RequestFilters
        period={period}
        onPeriodChange={setPeriod}
        defaultPeriod={currentPeriod}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
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
      </RequestFilters>
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noRequests")}</h2>
            <p>{t("noRequestsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("requestSubmittedOn")}</th>
                <th>{t("employee")}</th>
                <th>{t("requestType")}</th>
                <th>{t("requestTitle")}</th>
                <th className="amount-heading">{t("requestEstimatedCost")}</th>
                <th>{t("requestPayer")}</th>
                <th>{t("status")}</th>
                <th>{t("expense")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request) => {
                const own = request.userId === actorId;
                const closed =
                  nextStatuses(request.status, "reviewer").length === 0;
                return (
                  <tr key={request.id}>
                    <td>{request.submittedOn}</td>
                    <td>
                      {personLabel(request.userName, request.employeeNumber)}
                    </td>
                    <td>{t(`requestType_${request.type}`)}</td>
                    <td>
                      <strong>{request.title}</strong>
                    </td>
                    <td className="amount-cell">
                      {formatSek(request.estimatedCostMinor, locale)}
                    </td>
                    <td>{t(`requestPayer_${request.payer}`)}</td>
                    <td>
                      <RequestStatusBadge status={request.status} />
                    </td>
                    <td>
                      {request.expenseTransactionId
                        ? t("requestExpenseBooked")
                        : "—"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action icon-action"
                          aria-label={t("viewRequest")}
                          title={t("viewRequest")}
                          onClick={() => setViewing(request)}
                        >
                          <span aria-hidden="true">i</span>
                        </button>
                        <button
                          className="table-action icon-action"
                          aria-label={t("changeRequestStatus")}
                          title={
                            own
                              ? t("requestError_ownRequest")
                              : closed
                                ? t("requestClosed")
                                : t("changeRequestStatus")
                          }
                          disabled={own || closed}
                          onClick={() => openReview(request)}
                        >
                          <ActionIcon type="edit" />
                        </button>
                        {canBook && canBecomeExpense(request) && (
                          <button
                            className="table-action icon-action receipt-expense-action"
                            aria-label={t("addRequestAsExpense")}
                            title={t("addRequestAsExpense")}
                            onClick={() => router.push(expenseHref(request))}
                          >
                            <FileAddIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {viewing && (
        <RequestDetailModal
          request={viewing}
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
            aria-labelledby="request-review-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="request-review-title">{t("changeRequestStatus")}</h2>
                <p>
                  {reviewing.title} ·{" "}
                  {personLabel(reviewing.userName, reviewing.employeeNumber)} ·{" "}
                  <RequestStatusBadge status={reviewing.status} />
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
              <label>
                {t("requestNewStatus")}
                <select
                  className="field"
                  name="decision"
                  required
                  autoFocus
                  value={decision ?? ""}
                  onChange={(event) => {
                    setDecision(
                      (event.target.value || null) as RequestStatus | null,
                    );
                    setError("");
                  }}
                >
                  <option value="">{t("select")}</option>
                  {nextStatuses(reviewing.status, "reviewer").map((value) => (
                    <option key={value} value={value}>
                      {t(`requestStatus_${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {decision === "rejected"
                  ? t("requestReviewNoteRequired")
                  : decision === "changes_requested"
                    ? t("requestReviewNoteChanges")
                    : t("requestReviewNoteOptional")}
                <textarea
                  className="field"
                  name="note"
                  rows={3}
                  maxLength={1000}
                  required={
                    decision !== null &&
                    NOTE_REQUIRED_STATUSES.includes(decision)
                  }
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
                <button className="button" disabled={busy || !decision}>
                  {busy ? t("saving") : t("saveChanges")}
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
            aria-labelledby="request-expense-title"
            aria-describedby="request-expense-description"
          >
            <header className="modal-header">
              <div>
                <h2 id="request-expense-title">
                  {t("addRequestAsExpenseTitle")}
                </h2>
                <p id="request-expense-description">
                  {t("addRequestAsExpenseQuestion")
                    .replace("{name}", askExpense.title)
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
