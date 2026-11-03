"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileDownloadIcon } from "@/components/ui/FileActionIcons";
import { formatSek } from "@/domain/finance/calculations";
import {
  canApplyIncomingEmailAction,
  canConvertIncomingEmail,
  INCOMING_EMAIL_STATUSES,
  type IncomingEmailAction,
  INCOMING_SKIP_REASONS,
  type IncomingEmailRunSummary,
  type IncomingEmailStatus,
} from "@/domain/incoming-email";
import { appCheckFetch } from "@/lib/firebase/client";
import type { IncomingEmailView } from "@/server/services/incoming-email-service";
import {
  AttachmentPreviewModal,
  canPreview,
  PreviewButton,
  type PreviewTarget,
} from "../FinanceAttachments";

type Names = {
  categories: Record<string, string>;
  consultants: Record<string, string>;
  customers: Record<string, string>;
};

type Filter = IncomingEmailStatus | "all";

const AI_ERRORS = [
  "aiDisabled",
  "aiNotConfigured",
  "aiUnsupportedFile",
  "aiProviderRejected",
  "aiProviderFailed",
  "aiNoResult",
] as const;

const READ_ERRORS = [
  "incomingEmailBusy",
  "incomingEmailDisabled",
  "mailboxAuthFailed",
  "mailboxFolderMissing",
  "mailboxConnectionFailed",
] as const;

function attachmentUrl(emailId: string, attachmentId: string) {
  return `/api/finance/incoming-emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

function createHref(kind: "transaction" | "invoice", emailId: string) {
  return `/finance/${kind === "invoice" ? "invoices" : "transactions"}/new?incomingEmailId=${encodeURIComponent(emailId)}`;
}

function StatusBadge({ status }: { status: IncomingEmailStatus }) {
  const { t } = useLocale();
  const tone =
    status === "converted"
      ? " status-approved"
      : status === "failed"
        ? " status-rejected"
        : "";
  return (
    <span className={`status${tone}`}>
      {t(`incomingEmailStatus_${status}`)}
    </span>
  );
}

/** Emails forwarded to the finance mailbox, waiting to become records. */
export function IncomingEmails({
  initialEmails,
  names,
  lastRunAt: initialLastRunAt,
  canProcess,
  canAddTransaction,
  canAddInvoice,
}: {
  initialEmails: IncomingEmailView[];
  names: Names;
  lastRunAt: string | null;
  canProcess: boolean;
  canAddTransaction: boolean;
  canAddInvoice: boolean;
}) {
  const { t, locale } = useLocale();
  const [emails, setEmails] = useState(initialEmails);
  const [filter, setFilter] = useState<Filter>("ready");
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(initialLastRunAt);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<IncomingEmailView | null>(null);

  async function load(status: Filter) {
    setLoading(true);
    try {
      const response = await appCheckFetch(
        `/api/finance/incoming-emails${status === "all" ? "" : `?status=${status}`}`,
      );
      if (!response.ok) throw new Error("load failed");
      setEmails(
        ((await response.json()) as { emails: IncomingEmailView[] }).emails,
      );
    } catch {
      setError(t("incomingEmailLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  function summaryText(summary: IncomingEmailRunSummary) {
    const reasons = INCOMING_SKIP_REASONS.filter(
      (reason) => summary.skippedBy?.[reason],
    ).map((reason) =>
      t(`incomingEmailSkipped_${reason}`).replace(
        "{count}",
        String(summary.skippedBy![reason]),
      ),
    );
    if (summary.untrustedSenders?.length)
      reasons.push(
        t("incomingEmailSkippedSenders").replace(
          "{senders}",
          summary.untrustedSenders.join(", "),
        ),
      );
    return [
      t("incomingEmailReadSummary")
        .replace("{read}", String(summary.read))
        .replace("{stored}", String(summary.stored))
        .replace("{failed}", String(summary.failed))
        .replace("{skipped}", String(summary.skipped)),
      ...reasons,
    ].join(" ");
  }

  async function readNow() {
    setError("");
    setMessage("");
    setReading(true);
    try {
      const response = await appCheckFetch(
        "/api/finance/incoming-emails/read",
        {
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        summary?: IncomingEmailRunSummary;
        error?: string;
      } | null;
      setLastRunAt(new Date().toISOString());
      if (!response.ok || !body?.summary) {
        setError(
          READ_ERRORS.includes(body?.error as (typeof READ_ERRORS)[number])
            ? t(
                `incomingEmailError_${body!.error as (typeof READ_ERRORS)[number]}`,
              )
            : t("incomingEmailReadFailed"),
        );
        return;
      }
      setMessage(summaryText(body.summary));
      await load(filter);
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <section className="card filters-card">
        <div className="incoming-email-toolbar">
          <label>
            {t("status")}
            <select
              className="field"
              value={filter}
              onChange={(event) => {
                const value = event.target.value as Filter;
                setFilter(value);
                void load(value);
              }}
            >
              {INCOMING_EMAIL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`incomingEmailStatus_${status}`)}
                </option>
              ))}
              <option value="all">{t("incomingEmailStatusAll")}</option>
            </select>
          </label>
          <span className="muted">
            {lastRunAt
              ? t("incomingEmailLastRead").replace(
                  "{time}",
                  new Date(lastRunAt).toLocaleString(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                )
              : t("incomingEmailNeverRead")}
          </span>
          {canProcess && (
            <button
              className="button"
              type="button"
              disabled={reading}
              onClick={readNow}
            >
              {reading ? t("incomingEmailReading") : t("incomingEmailReadNow")}
            </button>
          )}
        </div>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice notice-success" role="status">
            {message}
          </p>
        )}
      </section>
      {emails.length === 0 ? (
        <section className="card empty-state">
          {loading ? t("loading") : t("incomingEmailNone")}
        </section>
      ) : (
        <section className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("incomingEmailReceived")}</th>
                <th>{t("incomingEmailFrom")}</th>
                <th>{t("incomingEmailSubject")}</th>
                <th>{t("incomingEmailType")}</th>
                <th>{t("amount")}</th>
                <th>{t("status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email.id}>
                  <td>
                    {email.receivedAt
                      ? new Date(email.receivedAt).toLocaleString(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td>{email.from}</td>
                  <td>{email.subject || "—"}</td>
                  <td>{t(`incomingEmailKind_${email.kind}`)}</td>
                  <td>
                    {email.extraction?.grossMinor != null
                      ? formatSek(email.extraction.grossMinor, locale)
                      : "—"}
                  </td>
                  <td>
                    <StatusBadge status={email.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("viewDetails")}
                        title={t("viewDetails")}
                        onClick={() => setViewing(email)}
                      >
                        i
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {viewing && (
        <IncomingEmailModal
          email={viewing}
          names={names}
          canProcess={canProcess}
          canAddTransaction={canAddTransaction}
          canAddInvoice={canAddInvoice}
          onClose={() => setViewing(null)}
          onChanged={(email) => {
            setViewing(email);
            setEmails((current) =>
              current
                .map((item) => (item.id === email.id ? email : item))
                .filter((item) => filter === "all" || item.status === filter),
            );
          }}
        />
      )}
    </>
  );
}

function IncomingEmailModal({
  email,
  names,
  canProcess,
  canAddTransaction,
  canAddInvoice,
  onClose,
  onChanged,
}: {
  email: IncomingEmailView;
  names: Names;
  canProcess: boolean;
  canAddTransaction: boolean;
  canAddInvoice: boolean;
  onClose(): void;
  onChanged(email: IncomingEmailView): void;
}) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState<IncomingEmailAction | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [error, setError] = useState("");
  const extraction = email.extraction;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !preview && !confirmDismiss) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview, confirmDismiss]);

  async function apply(action: IncomingEmailAction) {
    setError("");
    setBusy(action);
    try {
      const response = await appCheckFetch(
        `/api/finance/incoming-emails/${encodeURIComponent(email.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        email?: IncomingEmailView;
      } | null;
      if (!response.ok || !body?.email) {
        setError(t("incomingEmailActionFailed"));
        return;
      }
      setConfirmDismiss(false);
      onChanged(body.email);
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(null);
    }
  }

  async function download(attachmentId: string, name: string) {
    setError("");
    const response = await appCheckFetch(attachmentUrl(email.id, attachmentId));
    if (!response.ok)
      return setError(t("financeError_attachmentDownloadFailed"));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const fact = (label: string, value: string | null | undefined) =>
    value ? (
      <>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </>
    ) : null;
  const money = (minor: number | null | undefined) =>
    minor == null ? null : formatSek(minor, locale);
  const convertible = canProcess && canConvertIncomingEmail(email.status);
  const aiError = AI_ERRORS.find((code) => code === email.error);
  // The kind the AI recognized comes first.
  const createButtons = (
    email.kind === "invoice"
      ? (["invoice", "transaction"] as const)
      : (["transaction", "invoice"] as const)
  ).filter((kind) => (kind === "invoice" ? canAddInvoice : canAddTransaction));

  return (
    <>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section
          className="modal payslip-modal incoming-email-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-email-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="modal-header">
            <div>
              <span className="eyebrow">{t("incomingEmailDetails")}</span>
              <h2 id="incoming-email-title">
                {email.subject || t("incomingEmailNoSubject")}
              </h2>
              <p>{email.from}</p>
            </div>
            <button
              className="modal-close"
              type="button"
              aria-label={t("close")}
              onClick={onClose}
            >
              {"×"}
            </button>
          </header>
          {email.status === "failed" && (
            <p className="notice notice-warning">
              {t("incomingEmailFailedNotice").replace(
                "{reason}",
                aiError
                  ? t(`aiError_${aiError}`)
                  : t("incomingEmailUnknownError"),
              )}
            </p>
          )}
          <dl className="detail-grid">
            <div>
              <dt>{t("status")}</dt>
              <dd>
                <StatusBadge status={email.status} />
              </dd>
            </div>
            <div>
              <dt>{t("incomingEmailType")}</dt>
              <dd>{t(`incomingEmailKind_${email.kind}`)}</dd>
            </div>
          </dl>
          {extraction && (
            <>
              <h3>{t("incomingEmailExtracted")}</h3>
              <dl className="incoming-email-facts">
                {fact(
                  t("incomingEmailDirection"),
                  extraction.direction ? t(extraction.direction) : null,
                )}
                {fact(t("date"), extraction.date)}
                {fact(
                  t("incomingEmailCounterparty"),
                  extraction.counterpartyName,
                )}
                {fact(t("description"), extraction.description)}
                {fact(t("totalExcludingVat"), money(extraction.netMinor))}
                {fact(t("vatAmount"), money(extraction.vatMinor))}
                {fact(t("totalIncludingVat"), money(extraction.grossMinor))}
                {fact(
                  t("incomingEmailOriginalAmount"),
                  extraction.conversion?.grossMinor != null
                    ? `${(extraction.conversion.grossMinor / 100).toFixed(2)} ${extraction.conversion.currency}`
                    : null,
                )}
                {fact(
                  t("category"),
                  extraction.categoryId
                    ? names.categories[extraction.categoryId]
                    : null,
                )}
                {fact(
                  t("consultant"),
                  extraction.consultantId
                    ? names.consultants[extraction.consultantId]
                    : null,
                )}
                {fact(
                  t("funding"),
                  extraction.funding === "company"
                    ? t("companyFunded")
                    : extraction.funding === "consultant"
                      ? t("consultantFunded")
                      : null,
                )}
                {fact(
                  t("customer"),
                  extraction.customerId
                    ? names.customers[extraction.customerId]
                    : null,
                )}
                {fact(t("invoiceNumber"), extraction.invoiceNumber)}
                {fact(t("dueDate"), extraction.dueDate)}
                {fact(t("paymentReference"), extraction.paymentReference)}
              </dl>
            </>
          )}
          <h3>{t("attachments")}</h3>
          {email.attachments.length === 0 ? (
            <p className="muted">{t("incomingEmailNoAttachments")}</p>
          ) : (
            <ul className="incoming-email-attachments">
              {email.attachments.map((attachment) => (
                <li key={attachment.id} className="incoming-email-attachment">
                  <span>{attachment.name}</span>
                  {canPreview(attachment.contentType) && (
                    <PreviewButton
                      name={attachment.name}
                      onClick={() =>
                        setPreview({
                          name: attachment.name,
                          contentType: attachment.contentType,
                          fileUrl: attachmentUrl(email.id, attachment.id),
                        })
                      }
                    />
                  )}
                  <button
                    className="attachment-view"
                    type="button"
                    aria-label={`${t("download")} ${attachment.name}`}
                    title={`${t("download")} ${attachment.name}`}
                    onClick={() =>
                      void download(attachment.id, attachment.name)
                    }
                  >
                    <FileDownloadIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>{t("incomingEmailBody")}</h3>
          <pre className="incoming-email-body">{email.bodyText || "—"}</pre>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {email.createdEntity && (
              <Link
                className="button secondary"
                href={`/finance/${email.createdEntity.type === "invoice" ? "invoices" : "transactions"}/${encodeURIComponent(email.createdEntity.id)}`}
              >
                {email.createdEntity.type === "invoice"
                  ? t("incomingEmailOpenInvoice")
                  : t("incomingEmailOpenTransaction")}
              </Link>
            )}
            {canProcess &&
              canApplyIncomingEmailAction(email.status, "restore") && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void apply("restore")}
                >
                  {t("incomingEmailRestore")}
                </button>
              )}
            {convertible && (
              <>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirmDismiss(true)}
                >
                  {t("incomingEmailDismiss")}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void apply("retry")}
                >
                  {busy === "retry"
                    ? t("incomingEmailRetrying")
                    : t("incomingEmailRetry")}
                </button>
                {createButtons.map((kind) => (
                  <Link
                    key={kind}
                    className={`button${kind === createButtons[0] ? "" : " secondary"}`}
                    href={createHref(kind, email.id)}
                  >
                    {kind === "invoice"
                      ? t("incomingEmailCreateInvoice")
                      : t("incomingEmailCreateTransaction")}
                  </Link>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
      {preview && (
        <AttachmentPreviewModal
          target={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {confirmDismiss && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setConfirmDismiss(false)}
        >
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="incoming-email-dismiss-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="incoming-email-dismiss-title">
                {t("incomingEmailDismissTitle")}
              </h2>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setConfirmDismiss(false)}
              >
                {"×"}
              </button>
            </header>
            <p>{t("incomingEmailDismissText")}</p>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setConfirmDismiss(false)}
              >
                {t("cancel")}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy !== null}
                onClick={() => void apply("dismiss")}
              >
                {busy === "dismiss" ? t("saving") : t("incomingEmailDismiss")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
