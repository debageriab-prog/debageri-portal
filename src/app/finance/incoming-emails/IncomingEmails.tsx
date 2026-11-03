"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  DetailCollapsible,
  DetailFacts,
  DetailFile,
  DetailFiles,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
  hasDetailRows,
  type DetailRow,
} from "@/components/ui/DetailView";
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
  const groups: { title: string; rows: DetailRow[] }[] = extraction
    ? [
        {
          title: t("detailAmounts"),
          rows: [
            [t("totalExcludingVat"), money(extraction.netMinor)],
            [t("vatAmount"), money(extraction.vatMinor)],
            [t("totalIncludingVat"), money(extraction.grossMinor)],
            extraction.conversion?.grossMinor != null && [
              t("incomingEmailOriginalAmount"),
              `${(extraction.conversion.grossMinor / 100).toFixed(2)} ${extraction.conversion.currency}`,
            ],
          ],
        },
        {
          title: t("detailBooking"),
          rows: [
            extraction.categoryId && [
              t("category"),
              names.categories[extraction.categoryId],
            ],
            extraction.consultantId && [
              t("consultant"),
              names.consultants[extraction.consultantId],
            ],
            extraction.funding && [
              t("funding"),
              extraction.funding === "company"
                ? t("companyFunded")
                : t("consultantFunded"),
            ],
            extraction.customerId && [
              t("customer"),
              names.customers[extraction.customerId],
            ],
          ],
        },
        {
          title: t("incomingEmailPaymentDetails"),
          rows: [
            [t("invoiceNumber"), extraction.invoiceNumber],
            [t("dueDate"), extraction.dueDate],
            [t("paymentReference"), extraction.paymentReference],
          ],
        },
      ]
    : [];
  const factGroups = groups.filter((group) => hasDetailRows(group.rows));
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
          className="modal detail-modal"
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
              <p className="detail-meta">
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
          <DetailSummary
            tone={extraction?.direction ?? "neutral"}
            tags={
              <>
                <StatusBadge status={email.status} />
                <DetailTag>{t(`incomingEmailKind_${email.kind}`)}</DetailTag>
                {extraction?.direction && (
                  <DetailTag tone={extraction.direction}>
                    {t(extraction.direction)}
                  </DetailTag>
                )}
              </>
            }
            amount={money(extraction?.grossMinor)}
            headline={headline}
          >
            {extraction?.description}
          </DetailSummary>
          {factGroups.length > 0 && (
            <DetailSections>
              {factGroups.map((group) => (
                <DetailSection key={group.title} title={group.title}>
                  <DetailFacts rows={group.rows} />
                </DetailSection>
              ))}
            </DetailSections>
          )}
          <DetailSection
            title={t("attachments")}
            count={email.attachments.length}
          >
            {email.attachments.length === 0 ? (
              <p className="muted">{t("incomingEmailNoAttachments")}</p>
            ) : (
              <DetailFiles>
                {email.attachments.map((attachment) => (
                  <DetailFile
                    key={attachment.id}
                    name={attachment.name}
                    contentType={attachment.contentType}
                    size={attachment.size}
                  >
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
                  </DetailFile>
                ))}
              </DetailFiles>
            )}
          </DetailSection>
          <DetailCollapsible title={t("incomingEmailBody")}>
            <pre className="incoming-email-body">{email.bodyText || "—"}</pre>
          </DetailCollapsible>
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
