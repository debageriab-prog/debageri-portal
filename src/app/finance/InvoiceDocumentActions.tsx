"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: "issued" | "paid" | "void";
  customerFinanceEmail: string;
  ocrReference: string | null;
  pdfGeneratedAt: string | null;
  sentAt: string | null;
  sentTo: string | null;
};

type Notice = { tone: "success" | "error" | "warning"; text: string };

/** Error codes that point at a page where they can be fixed. */
const FIX_LINKS: Partial<Record<string, { href: string; label: MessageKey }>> =
  {
    invoiceSettingsIncomplete: {
      href: "/admin/settings/edit",
      label: "invoiceSettingsEdit",
    },
    emailNotConfigured: {
      href: "/admin/email-settings",
      label: "openEmailSettings",
    },
  };

/**
 * The customer invoice section of the invoice details: generate, download
 * and send the PDF, correct an unsent invoice, or void it.
 */
export function InvoiceDocumentActions({
  invoice,
  customerId,
  canEdit,
  canSend,
  canVoid,
  initialError,
}: {
  invoice: Invoice;
  customerId?: string;
  canEdit: boolean;
  canSend: boolean;
  canVoid: boolean;
  /** A PDF error from saving the invoice just before. */
  initialError?: string | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [state, setState] = useState({
    pdfGeneratedAt: invoice.pdfGeneratedAt,
    sentAt: invoice.sentAt,
    sentTo: invoice.sentTo,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"send" | "void" | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [notice, setNotice] = useState<Notice | null>(
    initialError
      ? {
          tone: "warning",
          text: `${t("invoiceSavedPdfFailed")} ${t(`financeError_${initialError}` as MessageKey)}`,
        }
      : null,
  );
  const [errorCode, setErrorCode] = useState<string | null>(
    initialError ?? null,
  );
  const voided = invoice.status === "void";
  const editable = canEdit && invoice.status === "issued" && !state.sentAt;

  const fail = (code: string) => {
    setErrorCode(code);
    setNotice({
      tone: "error",
      text: t(`financeError_${code}` as MessageKey),
    });
  };

  async function post(action: string, extra: Record<string, unknown> = {}) {
    const response = await appCheckFetch("/api/finance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, invoiceId: invoice.id, ...extra }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      generatedAt?: string;
      sentAt?: string;
      sentTo?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "financeOperationFailed");
    return result;
  }

  async function run(name: string, task: () => Promise<void>) {
    setBusy(name);
    setNotice(null);
    setErrorCode(null);
    try {
      await task();
    } catch (caught) {
      fail(caught instanceof Error ? caught.message : "financeOperationFailed");
    } finally {
      setBusy(null);
    }
  }

  const send = () =>
    run("send", async () => {
      const result = await post("sendInvoiceToCustomer");
      setConfirming(null);
      setState({
        pdfGeneratedAt: state.pdfGeneratedAt ?? new Date().toISOString(),
        sentAt: result.sentAt ?? new Date().toISOString(),
        sentTo: result.sentTo ?? invoice.customerFinanceEmail,
      });
      setNotice({
        tone: "success",
        text: t("invoiceSentTo").replace(
          "{email}",
          result.sentTo ?? invoice.customerFinanceEmail,
        ),
      });
      router.refresh();
    });

  const voidInvoice = () =>
    run("void", async () => {
      await post("voidInvoice", { reason: voidReason.trim() });
      setConfirming(null);
      setNotice({ tone: "success", text: t("invoiceVoided") });
      router.refresh();
    });

  // Stored in UTC; shown in Stockholm time like the rest of the portal.
  const when = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("sv-SE", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Stockholm",
        }).format(new Date(value))
      : "—";
  const fix = errorCode ? FIX_LINKS[errorCode] : undefined;

  return (
    <section className="detail-section invoice-document">
      <h3>{t("customerInvoice")}</h3>
      <dl className="detail-facts">
        <div>
          <dt>{t("invoicePdf_ocr")}</dt>
          <dd>{invoice.ocrReference || "—"}</dd>
        </div>
        <div>
          <dt>{t("invoicePdfGeneratedAt")}</dt>
          <dd>{when(state.pdfGeneratedAt)}</dd>
        </div>
        <div>
          <dt>{t("invoiceSentAt")}</dt>
          <dd>
            {state.sentAt
              ? `${when(state.sentAt)} · ${state.sentTo ?? ""}`
              : "—"}
          </dd>
        </div>
      </dl>
      {!voided && (
        <div className="invoice-document-actions">
          {canSend && (
            <button
              className="button"
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setNotice(null);
                setConfirming("send");
              }}
            >
              {state.sentAt ? t("resendInvoice") : t("sendInvoice")}
            </button>
          )}
          {editable && (
            <Link
              className="table-action icon-action"
              href={`/finance/invoices/${encodeURIComponent(invoice.id)}/edit`}
              aria-label={t("editInvoice")}
              title={t("editInvoice")}
            >
              <ActionIcon type="edit" />
            </Link>
          )}
          {canVoid && (
            <button
              className="table-action icon-action"
              type="button"
              aria-label={t("voidInvoice")}
              title={t("voidInvoice")}
              disabled={busy !== null}
              onClick={() => {
                setNotice(null);
                setConfirming("void");
              }}
            >
              <ActionIcon type="reverse" />
            </button>
          )}
          {state.sentAt && canEdit && (
            <InfoTip text={t("invoiceSentLockedTip")} />
          )}
        </div>
      )}
      {confirming === "send" && (
        <div className="notice notice-warning invoice-confirm">
          <p>
            {(state.sentAt
              ? t("resendInvoiceConfirm")
              : t("sendInvoiceConfirm")
            )
              .replace("{number}", invoice.invoiceNumber)
              .replace("{email}", invoice.customerFinanceEmail)}
          </p>
          <div className="actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setConfirming(null)}
            >
              {t("cancel")}
            </button>
            <button
              className="button"
              type="button"
              disabled={busy !== null}
              onClick={() => void send()}
            >
              {busy === "send" ? t("sending") : t("sendInvoice")}
            </button>
          </div>
        </div>
      )}
      {confirming === "void" && (
        <div className="notice notice-warning invoice-confirm">
          <p>
            {t(
              invoice.status === "paid"
                ? "voidPaidInvoiceConfirm"
                : "voidInvoiceConfirm",
            ).replace("{number}", invoice.invoiceNumber)}
          </p>
          <label>
            {t("voidReason")}
            <textarea
              className="field"
              rows={2}
              minLength={3}
              maxLength={300}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
          </label>
          <div className="actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setConfirming(null)}
            >
              {t("cancel")}
            </button>
            <button
              className="button danger"
              type="button"
              disabled={busy !== null || voidReason.trim().length < 3}
              onClick={() => void voidInvoice()}
            >
              {t("voidInvoice")}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role="status">
          {notice.text}
          {fix && (
            <>
              {" "}
              <Link href={fix.href}>{t(fix.label)}</Link>
            </>
          )}
          {errorCode === "customerAddressMissing" && customerId && (
            <>
              {" "}
              <Link
                href={`/finance/customers/${encodeURIComponent(customerId)}/edit`}
              >
                {t("editCustomer")}
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}
