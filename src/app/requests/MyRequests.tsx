"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { formatSek } from "@/domain/finance/calculations";
import {
  filterRequests,
  isEditableRequest,
  type RequestStatus,
  type RequestType,
} from "@/domain/requests";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  RequestDetailModal,
  RequestFilters,
  RequestStatusBadge,
  type RequestItem,
} from "./RequestParts";

export function MyRequests({
  requests,
  currentPeriod,
  notice,
  canSubmit,
}: {
  requests: RequestItem[];
  currentPeriod: string;
  notice: "submitted" | "saved" | null;
  canSubmit: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [period, setPeriod] = useState<string | null>(null);
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [type, setType] = useState<RequestType | "all">("all");
  const [viewing, setViewing] = useState<RequestItem | null>(null);
  const [withdrawing, setWithdrawing] = useState<RequestItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = filterRequests(requests, { period, status, type });

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/requests/${encodeURIComponent(withdrawing.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "withdrawn", note: "" }),
      },
    ).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(t("requestError_requestStatusFailed"));
    setWithdrawing(null);
    router.refresh();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("requests")}</div>
          <h1>{t("myRequests")}</h1>
          <p className="muted page-description">{t("myRequestsDescription")}</p>
        </div>
        {canSubmit && (
          <Link className="button" href="/requests/new">
            {t("newRequest")}
          </Link>
        )}
      </div>
      {notice && (
        <p className="notice notice-success" role="status">
          {t(notice === "submitted" ? "requestSubmitted" : "requestSaved")}
        </p>
      )}
      {error && !withdrawing && (
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
      />
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noRequests")}</h2>
            <p>{t("noOwnRequestsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("requestSubmittedOn")}</th>
                <th>{t("requestType")}</th>
                <th>{t("requestTitle")}</th>
                <th className="amount-heading">{t("requestEstimatedCost")}</th>
                <th>{t("status")}</th>
                <th>{t("requestReviewNote")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request) => (
                <tr key={request.id}>
                  <td>{request.submittedOn}</td>
                  <td>{t(`requestType_${request.type}`)}</td>
                  <td>
                    <strong>{request.title}</strong>
                  </td>
                  <td className="amount-cell">
                    {formatSek(request.estimatedCostMinor, locale)}
                  </td>
                  <td>
                    <RequestStatusBadge status={request.status} />
                  </td>
                  <td className="receipt-note-cell">
                    {request.reviewNote || "—"}
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
                      {isEditableRequest(request) && (
                        <>
                          <Link
                            className="table-action icon-action"
                            aria-label={t("editRequest")}
                            title={t("editRequest")}
                            href={`/requests/${encodeURIComponent(request.id)}/edit`}
                          >
                            <ActionIcon type="edit" />
                          </Link>
                          <button
                            className="table-action icon-action"
                            aria-label={t("withdrawRequest")}
                            title={t("withdrawRequest")}
                            onClick={() => {
                              setError("");
                              setWithdrawing(request);
                            }}
                          >
                            <ActionIcon type="reverse" />
                          </button>
                        </>
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
        <RequestDetailModal
          request={viewing}
          showPerson={false}
          onClose={() => setViewing(null)}
        />
      )}
      {withdrawing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="request-withdraw-title"
            aria-describedby="request-withdraw-description"
          >
            <header className="modal-header">
              <div>
                <h2 id="request-withdraw-title">{t("withdrawRequestTitle")}</h2>
                <p id="request-withdraw-description">
                  {t("withdrawRequestQuestion").replace(
                    "{name}",
                    withdrawing.title,
                  )}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setWithdrawing(null)}
              >
                ×
              </button>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setWithdrawing(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={withdraw}
              >
                {busy ? t("saving") : t("withdrawRequest")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
