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
import { shiftMonth } from "@/lib/dates/month";
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
type Period = "month" | "all";

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

/** A short label such as PDF or JPG for the file badge. */
function fileType(name: string, contentType: string) {
  const extension = /\.([a-z0-9]{1,4})$/i.exec(name)?.[1];
  return (extension ?? contentType.split("/")[1] ?? "file")
    .slice(0, 4)
    .toUpperCase();
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  initialMonth,
  names,
  lastRunAt: initialLastRunAt,
  canProcess,
  canAddTransaction,
  canAddInvoice,
}: {
  initialEmails: IncomingEmailView[];
  initialMonth: string;
  names: Names;
  lastRunAt: string | null;
  canProcess: boolean;
  canAddTransaction: boolean;
  canAddInvoice: boolean;
}) {
  const { t, locale } = useLocale();
  const [emails, setEmails] = useState(initialEmails);
  const [filter, setFilter] = useState<Filter>("ready");
  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(initialMonth);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(initialLastRunAt);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<IncomingEmailView | null>(null);

  async function load(
    status: Filter = filter,
    nextPeriod: Period = period,
    nextMonth: string = month,
  ) {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (nextPeriod === "month") params.set("month", nextMonth);
    try {
      const response = await appCheckFetch(
        `/api/finance/incoming-emails?${params.toString()}`,
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
      await load();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setReading(false);
    }
  }

  function changeMonth(value: string) {
    if (!value) return;
    setMonth(value);
    void load(filter, period, value);
  }

  // Spaces are ignored, so "1250" and "1 250" both find 1 250,00 kr.
  const searchable = (text: string) =>
    text.toLocaleLowerCase(locale).replace(/\s+/g, "");
  const query = searchable(search);
  const shown = query
    ? emails.filter((email) =>
        searchable(
          [
            email.from,
            email.subject,
            t(`incomingEmailKind_${email.kind}`),
            t(`incomingEmailStatus_${email.status}`),
            email.extraction?.counterpartyName,
            email.extraction?.description,
            email.extraction?.invoiceNumber,
            email.extraction?.paymentReference,
            email.extraction?.categoryId &&
              names.categories[email.extraction.categoryId],
            email.extraction?.consultantId &&
              names.consultants[email.extraction.consultantId],
            email.extraction?.customerId &&
              names.customers[email.extraction.customerId],
            email.extraction?.grossMinor != null &&
              formatSek(email.extraction.grossMinor, locale),
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(query),
      )
    : emails;

  return (
    <>
      <section className="card filters-card">
        <div className="finance-filter-bar finance-filter-bar-wide incoming-email-filters">
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
          <label>
            {t("periodType")}
            <select
              className="field"
              value={period}
              onChange={(event) => {
                const value = event.target.value as Period;
                setPeriod(value);
                void load(filter, value);
              }}
            >
              <option value="month">{t("month")}</option>
              <option value="all">{t("allTime")}</option>
            </select>
          </label>
          {period === "month" && (
            <div className="finance-filter-control">
              <span>{t("month")}</span>
              <div className="month-stepper">
                <button
                  className="button secondary month-step-button"
                  type="button"
                  aria-label={t("previousMonth")}
                  title={t("previousMonth")}
                  onClick={() => changeMonth(shiftMonth(month, -1))}
                >
                  {"\u2039"}
                </button>
                <input
                  className="field"
                  type="month"
                  value={month}
                  onChange={(event) => changeMonth(event.target.value)}
                />
                <button
                  className="button secondary month-step-button"
                  type="button"
                  aria-label={t("nextMonth")}
                  title={t("nextMonth")}
                  onClick={() => changeMonth(shiftMonth(month, 1))}
                >
                  {"\u203a"}
                </button>
              </div>
            </div>
          )}
          <label>
            {t("incomingEmailSearch")}
            <input
              className="field"
              type="search"
              value={search}
              placeholder={t("incomingEmailSearchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="incoming-email-toolbar">
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
      {shown.length === 0 ? (
        <section className="card empty-state">
          {loading
            ? t("loading")
            : emails.length > 0
              ? t("incomingEmailNoMatches")
              : t("incomingEmailNone")}
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
              {shown.map((email) => (
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

  const money = (minor: number | null | undefined) =>
    minor == null ? null : formatSek(minor, locale);
  const facts = (rows: [string, string | null | undefined][]) =>
    rows.filter((row): row is [string, string] => Boolean(row[1]));
  const factGroups = extraction
    ? [
        {
          title: t("incomingEmailAmounts"),
          rows: facts([
            [t("totalExcludingVat"), money(extraction.netMinor)],
            [t("vatAmount"), money(extraction.vatMinor)],
            [t("totalIncludingVat"), money(extraction.grossMinor)],
            [
              t("incomingEmailOriginalAmount"),
              extraction.conversion?.grossMinor != null
                ? `${(extraction.conversion.grossMinor / 100).toFixed(2)} ${extraction.conversion.currency}`
                : null,
            ],
          ]),
        },
        {
          title: t("incomingEmailBooking"),
          rows: facts([
            [
              t("category"),
              extraction.categoryId
                ? names.categories[extraction.categoryId]
                : null,
            ],
            [
              t("consultant"),
              extraction.consultantId
                ? names.consultants[extraction.consultantId]
                : null,
            ],
            [
              t("funding"),
              extraction.funding === "company"
                ? t("companyFunded")
                : extraction.funding === "consultant"
                  ? t("consultantFunded")
                  : null,
            ],
            [
              t("customer"),
              extraction.customerId
                ? names.customers[extraction.customerId]
                : null,
            ],
          ]),
        },
        {
          title: t("incomingEmailPaymentDetails"),
          rows: facts([
            [t("invoiceNumber"), extraction.invoiceNumber],
            [t("dueDate"), extraction.dueDate],
            [t("paymentReference"), extraction.paymentReference],
          ]),
        },
      ].filter((group) => group.rows.length > 0)
    : [];
  const headline = [extraction?.counterpartyName, extraction?.date]
    .filter(Boolean)
    .join(" · ");
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
              <p className="incoming-email-meta">
                <span>{email.from}</span>
                {email.receivedAt && (
                  <span>
                    {new Date(email.receivedAt).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </p>
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
          <div
            className={`incoming-email-summary${extraction?.direction ? ` incoming-email-summary-${extraction.direction}` : ""}`}
          >
            <div className="incoming-email-tags">
              <StatusBadge status={email.status} />
              <span className="incoming-email-tag">
                {t(`incomingEmailKind_${email.kind}`)}
              </span>
              {extraction?.direction && (
                <span
                  className={`incoming-email-tag incoming-email-tag-${extraction.direction}`}
                >
                  {t(extraction.direction)}
                </span>
              )}
            </div>
            {extraction?.grossMinor != null && (
              <strong className="incoming-email-amount">
                {money(extraction.grossMinor)}
              </strong>
            )}
            {headline && (
              <span className="incoming-email-headline">{headline}</span>
            )}
            {extraction?.description && (
              <p className="incoming-email-description">
                {extraction.description}
              </p>
            )}
          </div>
          {factGroups.length > 0 && (
            <div className="incoming-email-sections">
              {factGroups.map((group) => (
                <section className="incoming-email-section" key={group.title}>
                  <h3>{group.title}</h3>
                  <dl className="incoming-email-facts">
                    {group.rows.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
          <section className="incoming-email-section">
            <h3>
              {t("attachments")}
              <span className="incoming-email-count">
                {email.attachments.length}
              </span>
            </h3>
            {email.attachments.length === 0 ? (
              <p className="muted">{t("incomingEmailNoAttachments")}</p>
            ) : (
              <ul className="incoming-email-attachments">
                {email.attachments.map((attachment) => (
                  <li key={attachment.id} className="incoming-email-attachment">
                    <span className="incoming-email-file-type">
                      {fileType(attachment.name, attachment.contentType)}
                    </span>
                    <span className="incoming-email-file-name">
                      <strong>{attachment.name}</strong>
                      <small>{fileSize(attachment.size)}</small>
                    </span>
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
          </section>
          <details className="incoming-email-text">
            <summary>{t("incomingEmailBody")}</summary>
            <pre className="incoming-email-body">{email.bodyText || "—"}</pre>
          </details>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {email.createdEntity && (
              <Link
                className="button secondary"
                href={`/finance?section=${email.createdEntity.type === "invoice" ? "invoices" : "transactions"}&${email.createdEntity.type}=${encodeURIComponent(email.createdEntity.id)}`}
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
