"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  FinanceAttachments,
  saveFinanceAttachmentChanges,
} from "../../../FinanceAttachments";
import { useAccountingEmailPrompt } from "../../../AccountingEmailPrompt";

export function InvoiceAttachmentForm({
  invoiceId,
  invoiceNumber,
  uploadFailed,
  accountingRecipients = [],
}: {
  invoiceId: string;
  invoiceNumber: string;
  uploadFailed: boolean;
  /** Accounting contacts to offer emailing the invoice to after a new file. */
  accountingRecipients?: string[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accounting = useAccountingEmailPrompt("invoice", accountingRecipients);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveFinanceAttachmentChanges(
        "invoice",
        invoiceId,
        files,
        removed,
      );
      if (!result.ok) {
        setError(
          t(
            `financeError_${result.error ?? "attachmentUploadFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return;
      }
      const done = () => {
        router.push("/finance?section=invoices");
        router.refresh();
      };
      // Only a newly added file is worth sending again.
      if (files.length) accounting.offer(invoiceId, done);
      else done();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/finance?section=invoices">
            {t("backToInvoices")}
          </Link>
          <h1>{t("editInvoiceAttachments")}</h1>
          <p>{invoiceNumber}</p>
          <p className="muted page-description">
            {t("editInvoiceAttachmentsDescription")}
          </p>
        </div>
      </div>
      <section className="card">
        {uploadFailed && (
          <p className="notice notice-error">
            {t("invoiceCreatedUploadFailed")}
          </p>
        )}
        <form className="form-grid" onSubmit={submit}>
          <FinanceAttachments
            entityType="invoice"
            entityId={invoiceId}
            files={files}
            onFilesChange={setFiles}
            removedAttachmentIds={removed}
            onRemovedAttachmentIdsChange={setRemoved}
          />
          <div className="form-wide actions">
            <button className="button" disabled={busy}>
              {t("saveChanges")}
            </button>
          </div>
          {accounting.dialog}
          {error && (
            <p className="form-wide notice notice-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
