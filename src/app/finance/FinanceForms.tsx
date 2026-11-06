"use client";

import { DateInput } from "@/components/ui/DateInput";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  calculateVatMinor,
  calculateTransactionAmounts,
  formatSek,
  parseSek,
  parseSignedSek,
  MAX_ROUNDING_MINOR,
  type TransactionAmountMode,
} from "@/domain/finance/calculations";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  consultantServicesDescription,
  consultantServicesNote,
} from "@/domain/finance/invoice-period";
import { receiptVatRateBps } from "@/domain/receipts";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { addDays } from "@/domain/finance/invoice-settings";
import {
  ARTICLE_FOR_ALL,
  ARTICLE_FOR_COMPANY,
  articlesForInvoice,
  type InvoiceArticle,
} from "@/domain/finance/invoice-articles";

import {
  INVOICE_UNITS,
  invoiceTotals,
  formatQuantity,
  kronorRoundingMinor,
  lineAmountMinor,
  linesForInvoice,
  MAX_INVOICE_LINES,
  parseQuantity,
  withLineAmount,
  type InvoiceLine,
} from "@/domain/finance/invoice-lines";
import { appCheckFetch } from "@/lib/firebase/client";
import { FinanceCsvImport } from "./FinanceCsvImport";
import { transactionMonthMismatch } from "./transaction-navigation";
import {
  FinanceAttachments,
  processAttachmentWithAi,
  saveFinanceAttachmentChanges,
  type AiAttachmentSource,
} from "./FinanceAttachments";
import { useAccountingEmailPrompt } from "./AccountingEmailPrompt";
import type { FinanceExtraction } from "@/domain/ai";
import {
  useIncomingEmailPrefill,
  type IncomingEmailSource,
} from "./incoming-email-prefill";
import type { AccountingEntityType } from "@/domain/accounting-email";
import {
  aiConversionText,
  aiCurrencyWarningLines,
  aiErrorNotice,
  AiNotices,
  type AiNotice,
} from "./ai-notices";

/** Consultant select value meaning the transaction is the company's own. */
const COMPANY_ONLY = "company";

type TransactionField = "direction" | "categoryId" | "consultantId" | "funding";

type User = { id: string; displayName: string };
type Category = {
  id: string;
  code: string;
  name: { en: string; sv: string };
  direction: "income" | "expense";
  active: boolean;
};

export type EditableTransaction = {
  id: string;
  direction: "income" | "expense";
  categoryId: string;
  consultantId: string | null;
  date: string;
  netMinor: number;
  grossMinor: number;
  vatRateBps: number;
  roundingMinor: number;
  funding: "company" | "consultant" | null;
  applyConsultantShare: boolean;
  shareBpsOverride: number | null;
  visibleDescription: string;
  internalNote: string;
};

export type ExpenseReceipt = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  name: string;
  description: string;
  netMinor: number;
  vatMinor: number;
  fileName: string;
  contentType: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatMonth(month: string, locale: "sv-SE" | "en-SE") {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

function FormPage({
  title,
  description,
  backHref,
  backLabel,
  notice,
  children,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href={backHref}>
            ← {backLabel}
          </Link>
          <h1>{title}</h1>
          <p className="muted page-description">{description}</p>
        </div>
      </div>
      {notice}
      <section className="card">{children}</section>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="field-error" role="alert">
      {message}
    </span>
  ) : null;
}

function useFinanceSubmit(
  successPath:
    string | ((result: { id?: string; pdfError?: string }) => string),
  accounting?: {
    entityType: AccountingEntityType;
    recipients: string[];
  },
) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prompt = useAccountingEmailPrompt(
    accounting?.entityType ?? "transaction",
    accounting?.recipients ?? [],
  );
  async function submit(
    payload: Record<string, unknown>,
    attachment?: {
      entityType: "transaction" | "invoice";
      entityId?: string;
      files: File[];
      removedAttachmentIds: string[];
    },
  ) {
    setBusy(true);
    setError("");
    let createdInvoiceId: string | undefined;
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        pdfError?: string;
      };
      if (!response.ok) {
        const key =
          `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
            typeof t
          >[0];
        setError(t(key));
        return;
      }
      if (attachment?.entityType === "invoice" && !attachment.entityId)
        createdInvoiceId = result.id;
      if (
        attachment &&
        (attachment.files.length || attachment.removedAttachmentIds.length)
      ) {
        const upload = await saveFinanceAttachmentChanges(
          attachment.entityType,
          attachment.entityId ?? result.id ?? "",
          attachment.files,
          attachment.removedAttachmentIds,
        );
        if (!upload.ok) {
          if (
            attachment.entityType === "invoice" &&
            !attachment.entityId &&
            result.id
          ) {
            router.push(
              `/finance/invoices/${encodeURIComponent(result.id)}/attachments?uploadFailed=1`,
            );
            router.refresh();
            return;
          }
          setError(
            t(
              `financeError_${upload.error ?? "attachmentUploadFailed"}` as Parameters<
                typeof t
              >[0],
            ),
          );
          return;
        }
      }
      prompt.offer(attachment?.entityId ?? result.id, () => {
        router.push(
          typeof successPath === "string" ? successPath : successPath(result),
        );
        router.refresh();
      });
    } catch {
      if (createdInvoiceId) {
        router.push(
          `/finance/invoices/${encodeURIComponent(createdInvoiceId)}/attachments?uploadFailed=1`,
        );
        router.refresh();
        return;
      }
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit, accountingDialog: prompt.dialog };
}

/** Says which forwarded email the form was filled from. */
function IncomingEmailNotice({
  email,
  filesFailed,
}: {
  email: IncomingEmailSource;
  filesFailed: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="notice notice-success receipt-expense-notice">
      <strong>
        {t("incomingEmailFormNotice")
          .replace("{subject}", email.subject || t("incomingEmailNoSubject"))
          .replace("{from}", email.from)}
      </strong>
      <span>{t("incomingEmailFormCheck")}</span>
      {filesFailed && <span>{t("incomingEmailFilesFailed")}</span>}
    </div>
  );
}

/** An invoice customer with what the form fills in from it. */
export type InvoiceCustomer = {
  id: string;
  name: string;
  defaultYourReference: string;
  paymentTermsDays: number | null;
};

/** An unsent invoice as the form edits it. */
export type EditableInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  consultantId: string | null;
  issueDate: string;
  dueDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  netMinor: number;
  vatRateBps: number;
  roundingMinor: number;
  shareBpsOverride: number | null;
  visibleDescription: string;
  internalNote: string;
  lines: InvoiceLine[];
  ourReference: string;
  yourReference: string;
  invoiceText: string;
  /** Made with the invoice generator; false for invoices from elsewhere. */
  useGenerator: boolean;
};

/** Defaults for new invoices from the company invoice settings. */
export type InvoiceDefaults = {
  nextInvoiceNumber: number;
  defaultOurReference: string;
  paymentTermsDays: number;
};

type LineDraft = {
  key: number;
  /** The article the row comes from; empty for a row typed by hand. */
  articleId: string;
  articleNumber: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

let lineKey = 0;
const emptyLine = (): LineDraft => ({
  key: ++lineKey,
  articleId: "",
  articleNumber: "",
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
});
const draftFrom = (line: Omit<InvoiceLine, "amountMinor">): LineDraft => ({
  key: ++lineKey,
  articleId: line.articleId ?? "",
  articleNumber: line.articleNumber,
  description: line.description,
  quantity: String(line.quantityThousandths / 1000),
  unit: line.unit,
  unitPrice: (line.unitPriceMinor / 100).toFixed(2),
});

/** A row filled from an article, with the quantity it already has. */
const draftFromArticle = (
  article: InvoiceArticle,
  quantity = "1",
  key = ++lineKey,
): LineDraft => ({
  key,
  articleId: article.id,
  articleNumber: article.articleNumber,
  description: article.description,
  quantity,
  unit: article.unit,
  unitPrice: (article.unitPriceMinor / 100).toFixed(2),
});

/** A row as the server takes it, or null while it is not filled in. */
function lineFromDraft(draft: LineDraft) {
  const quantityThousandths = parseQuantity(draft.quantity);
  let unitPriceMinor: number;
  try {
    unitPriceMinor = parseSignedSek(draft.unitPrice);
  } catch {
    return null;
  }
  if (
    !draft.articleId ||
    !draft.description.trim() ||
    !Number.isFinite(quantityThousandths)
  )
    return null;
  return withLineAmount({
    articleId: draft.articleId || null,
    articleNumber: draft.articleNumber.trim(),
    description: draft.description.trim(),
    quantityThousandths,
    unit: draft.unit.trim(),
    unitPriceMinor,
  });
}

export function InvoiceForm({
  users,
  customers,
  aiEnabled = false,
  accountingRecipients = [],
  incomingEmail,
  invoice,
  defaults,
  articles = [],
  locked = null,
}: {
  users: User[];
  customers: InvoiceCustomer[];
  /** Every invoice article; the rows offer those that suit the invoice. */
  articles?: InvoiceArticle[];
  /**
   * Why a saved invoice can't change: it's paid, sent or void. Its details
   * are shown but disabled, and only its files can be changed.
   */
  locked?: "paid" | "sent" | "void" | null;
  aiEnabled?: boolean;
  /** Accounting contacts to offer emailing the new invoice to. */
  accountingRecipients?: string[];
  /** A forwarded email whose AI reading and files fill the form. */
  incomingEmail?: IncomingEmailSource;
  /** The unsent invoice being corrected; a new invoice when missing. */
  invoice?: EditableInvoice;
  defaults: InvoiceDefaults;
}) {
  const { t, locale } = useLocale();
  const editing = Boolean(invoice);
  const lockedRouter = useRouter();
  // Locked invoices keep amounts, rows and dates; a paid one can still have
  // its references, texts and notes changed.
  const fieldsLocked = Boolean(locked);
  const labelsLocked = Boolean(locked) && locked !== "paid";
  const [filesBusy, setFilesBusy] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice?.invoiceNumber ?? String(defaults.nextInvoiceNumber),
  );
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [consultantId, setConsultantId] = useState(invoice?.consultantId ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today());
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate ?? addDays(today(), defaults.paymentTermsDays),
  );
  // Until the due date is typed in, it follows the invoice date and terms.
  const [dueDateTouched, setDueDateTouched] = useState(editing);
  const [periodFrom, setPeriodFrom] = useState(invoice?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(invoice?.periodTo ?? "");
  // The last description and note generated from customer, consultant and
  // period; replaced on change until the user types their own.
  const [autoDescription, setAutoDescription] = useState("");
  const [autoInternalNote, setAutoInternalNote] = useState("");
  // New invoices use the generator unless they come from a forwarded email;
  // saved ones only when they were made with it.
  const [useGenerator, setUseGenerator] = useState(
    invoice ? invoice.useGenerator : !incomingEmail,
  );
  const [netAmount, setNetAmount] = useState(
    invoice && !invoice.useGenerator ? (invoice.netMinor / 100).toFixed(2) : "",
  );
  const [lines, setLines] = useState<LineDraft[]>(() =>
    invoice ? linesForInvoice(invoice).map(draftFrom) : [emptyLine()],
  );
  const [vatPercent, setVatPercent] = useState(
    invoice ? String(invoice.vatRateBps / 100) : "25",
  );
  const [rounding, setRounding] = useState(
    invoice?.roundingMinor ? (invoice.roundingMinor / 100).toFixed(2) : "",
  );
  const [visibleDescription, setVisibleDescription] = useState(
    invoice?.visibleDescription ?? "",
  );
  const [internalNote, setInternalNote] = useState(invoice?.internalNote ?? "");
  const [ourReference, setOurReference] = useState(
    invoice?.ourReference ?? defaults.defaultOurReference,
  );
  const [yourReference, setYourReference] = useState(
    invoice?.yourReference ?? "",
  );
  const [yourReferenceTouched, setYourReferenceTouched] = useState(editing);
  const [invoiceText, setInvoiceText] = useState(invoice?.invoiceText ?? "");
  const [hoursBusy, setHoursBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [sharePercent, setSharePercent] = useState(
    invoice?.shareBpsOverride != null
      ? String(invoice.shareBpsOverride / 100)
      : "",
  );
  // The PDF made from the form before saving, and the form it was made from.
  const [generatedPdf, setGeneratedPdf] = useState<File | null>(null);
  const [generatedFor, setGeneratedFor] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedError, setGeneratedError] = useState("");
  const [hoursNotice, setHoursNotice] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiProcessedKeys, setAiProcessedKeys] = useState<string[]>([]);
  const [aiNotice, setAiNotice] = useState<AiNotice | null>(null);
  const [aiCurrencyWarning, setAiCurrencyWarning] = useState<string[] | null>(
    null,
  );
  const returnHref = incomingEmail
    ? "/finance/incoming-emails"
    : "/finance?section=invoices";
  const [emailFilesFailed, setEmailFilesFailed] = useState(false);
  const { busy, error, submit, accountingDialog } = useFinanceSubmit(
    (result) =>
      result.id
        ? `/finance?section=invoices&invoice=${encodeURIComponent(result.id)}${
            result.pdfError
              ? `&pdfError=${encodeURIComponent(result.pdfError)}`
              : ""
          }`
        : returnHref,
    {
      entityType: "invoice",
      recipients: editing ? [] : accountingRecipients,
    },
  );
  const parsedLines = lines.map(lineFromDraft);
  // Articles for the chosen consultant (or the company) on the invoice date.
  const availableArticles = articlesForInvoice(
    articles,
    consultantId || null,
    issueDate,
  );
  const articleById = new Map(articles.map((item) => [item.id, item]));
  const articleRows = lines.filter((line) => line.articleId);
  const articleVatRates = [
    ...new Set(
      articleRows
        .map((line) => articleById.get(line.articleId)?.vatRateBps)
        .filter((rate): rate is number => rate !== undefined),
    ),
  ];
  // Rows from articles decide the VAT; mixed rates can't be on one invoice.
  const articleVatLocked = articleVatRates.length === 1;
  const mixedArticleVat = articleVatRates.length > 1;
  const unavailableArticleRows = articleRows.filter(
    (line) => !availableArticles.some((item) => item.id === line.articleId),
  );

  /** Fills a row from an article, or frees it for typing by hand. */
  function chooseArticle(key: number, articleId: string) {
    const article = articleById.get(articleId);
    setLines((current) =>
      current.map((line) =>
        line.key !== key
          ? line
          : article
            ? draftFromArticle(article, line.quantity, line.key)
            : { ...emptyLine(), key: line.key, quantity: line.quantity },
      ),
    );
    if (article) setVatPercent(String(article.vatRateBps / 100));
  }
  const roundingMinor = (() => {
    try {
      return parseSignedSek(rounding);
    } catch {
      return 0;
    }
  })();
  const vatRateBps = Math.round(Number(vatPercent || 0) * 100);
  const enteredNetMinor = (() => {
    try {
      return parseSek(netAmount || "0");
    } catch {
      return 0;
    }
  })();
  // With the generator the rows make the net; otherwise it is typed in from
  // the invoice made elsewhere.
  const totals = useGenerator
    ? invoiceTotals(
        parsedLines.filter((line): line is InvoiceLine => line !== null),
        Number.isFinite(vatRateBps) ? vatRateBps : 0,
        roundingMinor,
      )
    : (() => {
        const vatMinor = calculateVatMinor(
          enteredNetMinor,
          Number.isFinite(vatRateBps) ? vatRateBps : 0,
        );
        return {
          netMinor: enteredNetMinor,
          vatMinor,
          roundingMinor,
          grossMinor: enteredNetMinor + vatMinor + roundingMinor,
        };
      })();

  const termsFor = (id: string) =>
    customers.find((customer) => customer.id === id)?.paymentTermsDays ??
    defaults.paymentTermsDays;

  function updateLine(key: number, change: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  /**
   * Refreshes the generated consultant description and internal note after a
   * change, unless the user has written their own text in that field.
   */
  function updateGeneratedTexts(next: {
    customerId?: string;
    consultantId?: string;
    periodFrom?: string;
    periodTo?: string;
    fallbackDescription?: string | null;
    fallbackNote?: string;
    noteSuffix?: string;
  }) {
    const consultantName =
      users.find((user) => user.id === (next.consultantId ?? consultantId))
        ?.displayName ?? "";
    const customerName =
      customers.find(
        (customer) => customer.id === (next.customerId ?? customerId),
      )?.name ?? "";
    const from = (next.periodFrom ?? periodFrom) || null;
    const to = (next.periodTo ?? periodTo) || null;
    const description =
      consultantServicesDescription(consultantName, from, to) ?? "";
    const note = consultantServicesNote(customerName, consultantName, from, to);
    if (!visibleDescription.trim() || visibleDescription === autoDescription) {
      const value =
        description || next.fallbackDescription || visibleDescription;
      setVisibleDescription(value);
      setAutoDescription(value);
    }
    if (!internalNote.trim() || internalNote === autoInternalNote) {
      const value =
        (note && [note, next.noteSuffix].filter(Boolean).join(" - ")) ||
        next.fallbackNote ||
        internalNote;
      setInternalNote(value);
      setAutoInternalNote(value);
    }
  }

  /** Fills the form from an AI reading of a file or forwarded email. */
  function applyExtraction(extraction: FinanceExtraction, name: string) {
    let filled = 0;
    let readNetMinor: number | null = null;
    const foreignAmounts = extraction.currency !== "SEK";
    if (extraction.invoiceNumber) {
      setInvoiceNumber(extraction.invoiceNumber);
      filled++;
    }
    const customerFound = customers.some(
      (customer) => customer.id === extraction.customerId,
    );
    if (customerFound) {
      setCustomerId(extraction.customerId!);
      filled++;
    }
    const consultantFound = users.some(
      (user) => user.id === extraction.consultantId,
    );
    if (consultantFound) {
      setConsultantId(extraction.consultantId!);
      filled++;
    }
    if (extraction.periodFrom && extraction.periodTo) {
      setPeriodFrom(extraction.periodFrom);
      setPeriodTo(extraction.periodTo);
      filled++;
    }
    if (extraction.date) {
      setIssueDate(extraction.date);
      filled++;
    }
    if (extraction.dueDate) {
      setDueDate(extraction.dueDate);
      setDueDateTouched(true);
      filled++;
    }
    if (
      !foreignAmounts &&
      extraction.netMinor !== null &&
      extraction.netMinor > 0
    ) {
      // Rows come from articles, so the amount read from the file is only
      // shown for comparison.
      readNetMinor = extraction.netMinor;
      setNetAmount((extraction.netMinor / 100).toFixed(2));
    }
    if (!foreignAmounts)
      setRounding(
        extraction.roundingMinor
          ? (extraction.roundingMinor / 100).toFixed(2)
          : "",
      );
    if (extraction.vatRateBps !== null) {
      setVatPercent(String(extraction.vatRateBps / 100));
      filled++;
    }
    const conversionText = aiConversionText(extraction, t, locale);
    updateGeneratedTexts({
      customerId: customerFound ? extraction.customerId! : undefined,
      consultantId: consultantFound ? extraction.consultantId! : undefined,
      periodFrom: extraction.periodFrom ?? undefined,
      periodTo: extraction.periodTo ?? undefined,
      fallbackDescription: extraction.description,
      fallbackNote: [
        extraction.counterpartyName,
        extraction.description,
        conversionText,
      ]
        .filter(Boolean)
        .join(" - "),
      noteSuffix: conversionText,
    });
    setAiCurrencyWarning(aiCurrencyWarningLines(extraction, conversionText, t));
    if (!filled) {
      setAiNotice({
        tone: "warning",
        messages: [t("aiNothingFound").replace("{name}", name)],
      });
      return;
    }
    const messages = [t("aiFilledFromFile").replace("{name}", name)];
    if (readNetMinor !== null && useGenerator)
      messages.push(
        t("aiNetForArticles").replace(
          "{amount}",
          formatSek(readNetMinor, locale),
        ),
      );
    if (
      !foreignAmounts &&
      extraction.netMinor !== null &&
      extraction.vatMinor !== null &&
      extraction.vatRateBps !== null &&
      calculateVatMinor(extraction.netMinor, extraction.vatRateBps) !==
        extraction.vatMinor
    )
      messages.push(
        t("aiVatDiffers").replace(
          "{vat}",
          formatSek(extraction.vatMinor, locale),
        ),
      );
    if (!customerFound && !customerId) messages.push(t("aiChooseRemaining"));
    setAiNotice({
      tone: "success",
      messages,
    });
  }

  async function processWithAi(
    source: AiAttachmentSource,
    key: string,
    name: string,
  ) {
    setAiBusyKey(key);
    setAiNotice(null);
    setAiCurrencyWarning(null);
    const result = await processAttachmentWithAi(source, "invoice");
    setAiBusyKey(null);
    const extraction = result.extraction;
    if (!extraction) {
      setAiNotice(aiErrorNotice(result, t));
      return;
    }
    setAiProcessedKeys((keys) => [...keys, key]);
    applyExtraction(extraction, name);
  }

  useIncomingEmailPrefill(incomingEmail, (files, failed) => {
    setAttachmentFiles(files);
    setEmailFilesFailed(failed);
    if (incomingEmail?.extraction)
      applyExtraction(
        incomingEmail.extraction,
        incomingEmail.subject || t("incomingEmailSourceName"),
      );
  });

  /**
   * The hourly article that approved hours are billed on: the one already
   * on a row, else the consultant's own hourly article, else the only
   * hourly article for this invoice.
   */
  function hourlyTarget() {
    const isHourly = (item: InvoiceArticle | undefined) =>
      item?.unit.trim().toLowerCase() === "h";
    const onRow = lines.find((line) =>
      isHourly(articleById.get(line.articleId)),
    );
    if (onRow) return { article: articleById.get(onRow.articleId)!, onRow };
    const hourly = availableArticles.filter(isHourly);
    const own = hourly.filter((item) => item.consultantScope === consultantId);
    const article =
      own.length === 1 ? own[0] : hourly.length === 1 ? hourly[0] : undefined;
    return article ? { article, onRow: undefined } : null;
  }

  /**
   * Sets the hourly article's quantity to the consultant's approved worked
   * hours in the period, adding that row when no row has it yet.
   */
  async function fillFromHours() {
    setHoursNotice(null);
    if (!consultantId || !periodFrom || !periodTo) {
      setHoursNotice({ tone: "warning", text: t("invoiceHoursNeedPeriod") });
      return;
    }
    const target = hourlyTarget();
    if (!target) {
      setHoursNotice({ tone: "warning", text: t("invoiceHoursNeedArticle") });
      return;
    }
    setHoursBusy(true);
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "invoiceHours",
          consultantId,
          periodFrom,
          periodTo,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        approvedMinutes?: number;
        pendingMinutes?: number;
      };
      if (!response.ok) {
        setHoursNotice({
          tone: "error",
          text: t(
            `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        });
        return;
      }
      const approvedMinutes = result.approvedMinutes ?? 0;
      if (!approvedMinutes) {
        setHoursNotice({ tone: "warning", text: t("invoiceHoursNone") });
        return;
      }
      // Minutes to hours with up to three decimals, as the quantity field
      // takes them.
      const quantity = String(Math.round((approvedMinutes * 1000) / 60) / 1000);
      setLines((current) => {
        if (target.onRow)
          return current.map((line) =>
            line.key === target.onRow!.key ? { ...line, quantity } : line,
          );
        const row = draftFromArticle(target.article, quantity);
        // An empty first row is used; otherwise the hours get a row of
        // their own under the others.
        return current.length === 1 && !current[0]!.articleId
          ? [{ ...row, key: current[0]!.key }]
          : [...current, row];
      });
      setVatPercent(String(target.article.vatRateBps / 100));
      const consultantName =
        users.find((user) => user.id === consultantId)?.displayName ?? "";
      if (!invoiceText.trim())
        setInvoiceText(
          [
            t("invoiceHoursText")
              .replace("{from}", periodFrom)
              .replace("{to}", periodTo),
            t("invoiceHoursConsultant").replace("{name}", consultantName),
            yourReference,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      const hours = (minutes: number) =>
        new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
          minutes / 60,
        );
      setHoursNotice(
        result.pendingMinutes
          ? {
              tone: "warning",
              text: t("invoiceHoursPending")
                .replace("{approved}", hours(approvedMinutes))
                .replace("{pending}", hours(result.pendingMinutes))
                .replace("{article}", target.article.description),
            }
          : {
              tone: "success",
              text: t("invoiceHoursFilled")
                .replace("{approved}", hours(approvedMinutes))
                .replace("{article}", target.article.description),
            },
      );
    } catch {
      setHoursNotice({ tone: "error", text: t("serverUnavailable") });
    } finally {
      setHoursBusy(false);
    }
  }

  /** Stops on rows that can't be saved, saying why. */
  function rowsReady() {
    if (!useGenerator) return true;
    if (mixedArticleVat) {
      setHoursNotice({ tone: "error", text: t("invoiceArticlesMixedVat") });
      return false;
    }
    if (parsedLines.some((line) => line === null)) {
      setHoursNotice({ tone: "error", text: t("invoiceLinesIncomplete") });
      return false;
    }
    return true;
  }

  /** The invoice as the form has it, in the shape the API takes. */
  function invoicePayload() {
    return {
      invoiceNumber,
      consultantId: consultantId || null,
      customerId,
      issueDate,
      dueDate,
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      useGenerator,
      netMinor: Math.max(totals.netMinor, 0),
      vatRateBps,
      roundingMinor,
      visibleDescription,
      internalNote,
      shareBpsOverride: sharePercent
        ? Math.round(Number(sharePercent) * 100)
        : null,
      lines: (useGenerator ? parsedLines : []).map((line) => ({
        articleId: line!.articleId ?? null,
        articleNumber: line!.articleNumber,
        description: line!.description,
        quantityThousandths: line!.quantityThousandths,
        unit: line!.unit,
        unitPriceMinor: line!.unitPriceMinor,
      })),
      ourReference,
      yourReference,
      invoiceText,
    };
  }

  /**
   * Makes the invoice PDF from the form as it is now and attaches it, so it
   * can be looked at, removed or made again before saving.
   */
  async function generatePdf() {
    setGeneratedError("");
    if (!formRef.current?.reportValidity() || !rowsReady()) return;
    const payload = invoicePayload();
    setGenerating(true);
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "previewInvoicePdf",
          invoiceId: invoice?.id ?? null,
          ...payload,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setGeneratedError(
          t(
            `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return;
      }
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(
        response.headers.get("content-disposition") ?? "",
      )?.[1];
      const name = encoded
        ? decodeURIComponent(encoded)
        : `${t("invoicePdf_title")} ${invoiceNumber}.pdf`;
      setGeneratedPdf(
        new File([await response.blob()], name, { type: "application/pdf" }),
      );
      setGeneratedFor(JSON.stringify(payload));
    } catch {
      setGeneratedError(t("serverUnavailable"));
    } finally {
      setGenerating(false);
    }
  }

  /** Saves only the file changes of an invoice that can't be edited. */
  async function saveFilesOnly(invoiceId: string) {
    setFilesBusy(true);
    setFilesError("");
    try {
      if (!labelsLocked) {
        const response = await appCheckFetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "updateInvoiceLabels",
            invoiceId,
            ourReference,
            yourReference,
            invoiceText,
            visibleDescription,
            internalNote,
          }),
        });
        if (!response.ok) {
          const failed = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setFilesError(
            t(
              `financeError_${failed.error ?? "financeOperationFailed"}` as Parameters<
                typeof t
              >[0],
            ),
          );
          return;
        }
      }
      const result = await saveFinanceAttachmentChanges(
        "invoice",
        invoiceId,
        attachmentFiles,
        removedAttachmentIds,
      );
      if (!result.ok) {
        setFilesError(
          t(
            `financeError_${result.error ?? "attachmentUploadFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return;
      }
      lockedRouter.push(
        `/finance?section=invoices&invoice=${encodeURIComponent(invoiceId)}`,
      );
      lockedRouter.refresh();
    } catch {
      setFilesError(t("serverUnavailable"));
    } finally {
      setFilesBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked && invoice) {
      void saveFilesOnly(invoice.id);
      return;
    }
    if (!rowsReady()) return;
    void submit(
      {
        action: editing ? "updateInvoice" : "createInvoice",
        ...(invoice ? { invoiceId: invoice.id } : {}),
        ...invoicePayload(),
        // The attached PDF is made again from the saved invoice.
        generatePdf: Boolean(generatedPdf),
        ...(incomingEmail ? { incomingEmailId: incomingEmail.id } : {}),
      },
      {
        entityType: "invoice",
        entityId: invoice?.id,
        files: attachmentFiles,
        removedAttachmentIds,
      },
    );
  }
  return (
    <FormPage
      title={
        locked ? t("viewInvoice") : editing ? t("editInvoice") : t("addInvoice")
      }
      description={
        locked
          ? t("viewInvoiceDescription")
          : editing
            ? t("editInvoiceDescription")
            : t("newInvoiceDescription")
      }
      backHref={returnHref}
      backLabel={
        incomingEmail ? t("backToIncomingEmails") : t("backToInvoices")
      }
      notice={
        locked ? (
          <p className="notice notice-warning">
            {t(`invoiceLocked_${locked}`)}
          </p>
        ) : (
          incomingEmail && (
            <IncomingEmailNotice
              email={incomingEmail}
              filesFailed={emailFilesFailed}
            />
          )
        )
      }
    >
      {!customers.length ? (
        <p className="notice notice-error">
          {t("noCustomersForInvoice")}{" "}
          <Link href="/finance/customers/new">{t("addCustomer")}</Link>
        </p>
      ) : (
        <form className="form-grid" ref={formRef} onSubmit={onSubmit}>
          <label>
            {t("invoiceNumber")}
            <InfoTip text={t("invoiceNumberTip")} />
            <input
              className="field"
              name="invoiceNumber"
              disabled={fieldsLocked}
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              required
            />
          </label>
          <label>
            {t("customer")}
            <InfoTip text={t("customerTip")} />
            <select
              className="field"
              name="customerId"
              disabled={fieldsLocked}
              value={customerId}
              onChange={(event) => {
                const id = event.target.value;
                setCustomerId(id);
                updateGeneratedTexts({ customerId: id });
                const customer = customers.find((item) => item.id === id);
                if (!yourReferenceTouched)
                  setYourReference(customer?.defaultYourReference ?? "");
                if (!dueDateTouched)
                  setDueDate(addDays(issueDate, termsFor(id)));
              }}
              required
            >
              <option value="">{t("selectCustomer")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("consultant")}
            <InfoTip text={t("invoiceConsultantTip")} />
            <select
              className="field"
              name="consultantId"
              disabled={fieldsLocked}
              value={consultantId}
              onChange={(event) => {
                setConsultantId(event.target.value);
                updateGeneratedTexts({ consultantId: event.target.value });
              }}
            >
              <option value="">{t("companyOnly")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("periodFrom")}
            <InfoTip text={t("periodFromTip")} />
            <DateInput
              className="field"
              name="periodFrom"
              disabled={fieldsLocked}
              value={periodFrom}
              max={periodTo || undefined}
              required={Boolean(periodTo)}
              onChange={(event) => {
                setPeriodFrom(event.target.value);
                updateGeneratedTexts({ periodFrom: event.target.value });
              }}
            />
          </label>
          <label>
            {t("periodTo")}
            <InfoTip text={t("periodToTip")} />
            <DateInput
              className="field"
              name="periodTo"
              disabled={fieldsLocked}
              value={periodTo}
              min={periodFrom || undefined}
              required={Boolean(periodFrom)}
              onChange={(event) => {
                setPeriodTo(event.target.value);
                updateGeneratedTexts({ periodTo: event.target.value });
              }}
            />
          </label>
          <label>
            {t("issueDate")}
            <InfoTip text={t("issueDateTip")} />
            <DateInput
              className="field"
              name="issueDate"
              disabled={fieldsLocked}
              value={issueDate}
              onChange={(event) => {
                setIssueDate(event.target.value);
                if (!dueDateTouched && event.target.value)
                  setDueDate(addDays(event.target.value, termsFor(customerId)));
              }}
              required
            />
          </label>
          <label>
            {t("dueDate")}
            <InfoTip text={t("dueDateTip")} />
            <DateInput
              className="field"
              name="dueDate"
              disabled={fieldsLocked}
              value={dueDate}
              min={issueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setDueDateTouched(true);
              }}
              required
            />
          </label>
          <label>
            {t("ourReference")}
            <InfoTip text={t("ourReferenceTip")} />
            <input
              className="field"
              name="ourReference"
              disabled={labelsLocked}
              value={ourReference}
              maxLength={120}
              onChange={(event) => setOurReference(event.target.value)}
            />
          </label>
          <label>
            {t("yourReference")}
            <InfoTip text={t("yourReferenceTip")} />
            <input
              className="field"
              name="yourReference"
              disabled={labelsLocked}
              value={yourReference}
              maxLength={120}
              onChange={(event) => {
                setYourReference(event.target.value);
                setYourReferenceTouched(true);
              }}
            />
          </label>

          <label className="checkbox-row form-wide">
            <input
              type="checkbox"
              checked={useGenerator}
              disabled={fieldsLocked}
              onChange={(event) => {
                setUseGenerator(event.target.checked);
                // A PDF made from rows no longer fits an invoice without them.
                if (!event.target.checked) {
                  setGeneratedPdf(null);
                  setGeneratedFor("");
                }
              }}
            />
            <span>{t("useInvoiceGenerator")}</span>
            <InfoTip text={t("useInvoiceGeneratorTip")} />
          </label>

          {!useGenerator && (
            <label>
              {t("netAmountSek")}
              <InfoTip text={t("netAmountSekTip")} />
              <input
                className="field"
                type="number"
                name="netAmount"
                disabled={fieldsLocked}
                min="0.01"
                step="0.01"
                value={netAmount}
                onChange={(event) => setNetAmount(event.target.value)}
                required
              />
            </label>
          )}

          {useGenerator && (
            <fieldset className="access-section form-wide invoice-lines">
              <legend>{t("invoiceLines")}</legend>
              <div className="table-wrap">
                <table className="invoice-lines-table">
                  <thead>
                    <tr>
                      <th className="invoice-line-article">
                        {articles.length
                          ? t("invoiceLineChooseArticle")
                          : t("invoiceLineArticle")}
                      </th>
                      <th>{t("invoiceLineDescription")}</th>
                      <th className="invoice-line-quantity numeric">
                        {t("invoiceLineQuantity")}
                      </th>
                      <th className="invoice-line-unit">
                        {t("invoiceLineUnit")}
                      </th>
                      <th className="invoice-line-price numeric">
                        {t("invoiceLineUnitPrice")}
                      </th>
                      <th className="invoice-line-amount numeric">
                        {t("invoiceLineAmount")}
                      </th>
                      <th>
                        <span className="sr-only">{t("actions")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) =>
                      locked ? (
                        <tr key={line.key}>
                          <td className="invoice-line-article">
                            {line.articleNumber || "—"}
                          </td>
                          <td>{line.description || "—"}</td>
                          <td className="invoice-line-quantity numeric">
                            {formatQuantity(
                              parseQuantity(line.quantity),
                              locale,
                            )}
                          </td>
                          <td className="invoice-line-unit">{line.unit}</td>
                          <td className="invoice-line-price numeric">
                            {formatSek(
                              Math.round(Number(line.unitPrice) * 100),
                              locale,
                            )}
                          </td>
                          <td className="invoice-line-amount numeric">
                            {formatSek(
                              lineAmountMinor(
                                parseQuantity(line.quantity),
                                Math.round(Number(line.unitPrice) * 100),
                              ),
                              locale,
                            )}
                          </td>
                          <td />
                        </tr>
                      ) : (
                        <tr key={line.key}>
                          <td className="invoice-line-article">
                            <select
                              className="field"
                              aria-label={t("invoiceLineChooseArticle")}
                              value={line.articleId}
                              required
                              onChange={(event) =>
                                chooseArticle(line.key, event.target.value)
                              }
                            >
                              <option value="">
                                {t("invoiceLineSelectArticle")}
                              </option>
                              {availableArticles.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.articleNumber} {"·"} {item.description}
                                </option>
                              ))}
                              {line.articleId &&
                                !availableArticles.some(
                                  (item) => item.id === line.articleId,
                                ) && (
                                  <option value={line.articleId}>
                                    {line.articleNumber} {"·"}{" "}
                                    {line.description} (
                                    {t("articleNotValidHere")})
                                  </option>
                                )}
                            </select>
                          </td>
                          <td>{line.articleId ? line.description : "—"}</td>
                          <td className="invoice-line-quantity">
                            <input
                              className="field numeric"
                              inputMode="decimal"
                              aria-label={t("invoiceLineQuantity")}
                              value={line.quantity}
                              required
                              onChange={(event) =>
                                updateLine(line.key, {
                                  quantity: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="invoice-line-unit">
                            {line.articleId ? line.unit : ""}
                          </td>
                          <td className="invoice-line-price numeric">
                            {line.articleId
                              ? formatSek(
                                  articleById.get(line.articleId)
                                    ?.unitPriceMinor ??
                                    Math.round(Number(line.unitPrice) * 100),
                                  locale,
                                )
                              : ""}
                          </td>
                          <td className="invoice-line-amount numeric">
                            {parsedLines[index]
                              ? formatSek(
                                  parsedLines[index].amountMinor,
                                  locale,
                                )
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="table-action icon-action"
                              type="button"
                              aria-label={t("invoiceLineRemove")}
                              title={t("invoiceLineRemove")}
                              disabled={lines.length === 1}
                              onClick={() =>
                                setLines((current) =>
                                  current.filter(
                                    (item) => item.key !== line.key,
                                  ),
                                )
                              }
                            >
                              <ActionIcon type="delete" />
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              {!locked && (
                <div className="invoice-lines-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={lines.length >= MAX_INVOICE_LINES}
                    onClick={() =>
                      setLines((current) => [...current, emptyLine()])
                    }
                  >
                    {t("invoiceLineAdd")}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={hoursBusy}
                    onClick={() => void fillFromHours()}
                  >
                    {hoursBusy ? t("loading") : t("invoiceHoursFill")}
                  </button>
                  <InfoTip text={t("invoiceHoursFillTip")} />
                </div>
              )}
              {!locked && !availableArticles.length && (
                <p className="notice notice-warning">
                  {t("invoiceNoArticles")}{" "}
                  <Link href="/finance/articles/new">{t("addArticle")}</Link>
                </p>
              )}
              {mixedArticleVat && (
                <p className="notice notice-error">
                  {t("invoiceArticlesMixedVat")}
                </p>
              )}
              {!locked && unavailableArticleRows.length > 0 && (
                <p className="notice notice-warning">
                  {t("invoiceArticleNotApplicableRow")}
                </p>
              )}
              {hoursNotice && (
                <p className={`notice notice-${hoursNotice.tone}`}>
                  {hoursNotice.text}
                </p>
              )}
              <label>
                {t("invoiceText")}
                <InfoTip text={t("invoiceTextTip")} />
                <textarea
                  className="field"
                  name="invoiceText"
                  disabled={labelsLocked}
                  rows={4}
                  maxLength={1000}
                  value={invoiceText}
                  onChange={(event) => setInvoiceText(event.target.value)}
                />
              </label>
            </fieldset>
          )}

          <label>
            {t("vatPercent")}
            <InfoTip text={t("vatPercentTip")} />
            <input
              className="field"
              type="number"
              name="vatPercent"
              disabled={fieldsLocked}
              min="0"
              max="100"
              step="0.01"
              value={vatPercent}
              readOnly={useGenerator && articleVatLocked}
              onChange={(event) => setVatPercent(event.target.value)}
              required
            />
          </label>
          <label>
            {t("roundingSek")}
            <InfoTip text={t("roundingSekTip")} />
            <input
              className="field"
              type="number"
              min={-MAX_ROUNDING_MINOR / 100}
              max={MAX_ROUNDING_MINOR / 100}
              step="0.01"
              value={rounding}
              disabled={fieldsLocked}
              placeholder="0.00"
              onChange={(event) => setRounding(event.target.value)}
            />
          </label>
          <label>
            {t("shareOverride")}
            <InfoTip text={t("shareOverrideTip")} />
            <input
              className="field"
              type="number"
              name="sharePercent"
              disabled={fieldsLocked}
              min="0"
              max="100"
              step="0.01"
              value={sharePercent}
              onChange={(event) => setSharePercent(event.target.value)}
            />
          </label>
          <label>
            {t("consultantDescription")}
            <InfoTip text={t("consultantDescriptionTip")} />
            <input
              className="field"
              name="visibleDescription"
              disabled={labelsLocked}
              value={visibleDescription}
              onChange={(event) => setVisibleDescription(event.target.value)}
            />
          </label>
          <label>
            {t("internalNote")}
            <InfoTip text={t("internalNoteTip")} />
            <input
              className="field"
              name="internalNote"
              disabled={labelsLocked}
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </label>
          <div
            className="transaction-amount-summary form-wide"
            aria-live="polite"
          >
            <div>
              <span>{t("netAmount")}</span>
              <strong>{formatSek(totals.netMinor, locale)}</strong>
            </div>
            <div>
              <span>{t("vatAmount")}</span>
              <strong>{formatSek(totals.vatMinor, locale)}</strong>
            </div>
            <div>
              <span>{t("rounding")}</span>
              <strong>{formatSek(roundingMinor, locale)}</strong>
            </div>
            <div>
              <span>{t("totalIncludingVat")}</span>
              <strong>{formatSek(totals.grossMinor, locale)}</strong>
            </div>
          </div>
          {!locked && useGenerator && (
            <div className="form-wide invoice-lines-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setRounding(
                    (
                      kronorRoundingMinor(totals.netMinor + totals.vatMinor) /
                      100
                    ).toFixed(2),
                  )
                }
              >
                {t("roundToKronor")}
              </button>
            </div>
          )}
          <FinanceAttachments
            entityType="invoice"
            entityId={invoice?.id}
            generated={
              locked || !useGenerator
                ? undefined
                : {
                    file: generatedPdf,
                    busy: generating,
                    stale:
                      Boolean(generatedPdf) &&
                      generatedFor !== JSON.stringify(invoicePayload()),
                    error: generatedError,
                    onGenerate: () => void generatePdf(),
                    onRemove: () => {
                      setGeneratedPdf(null);
                      setGeneratedFor("");
                    },
                  }
            }
            files={attachmentFiles}
            onFilesChange={setAttachmentFiles}
            removedAttachmentIds={removedAttachmentIds}
            onRemovedAttachmentIdsChange={setRemovedAttachmentIds}
            ai={
              aiEnabled && !locked
                ? {
                    busyKey: aiBusyKey,
                    processedKeys: aiProcessedKeys,
                    onProcess: processWithAi,
                  }
                : undefined
            }
          />
          <AiNotices notice={aiNotice} currencyWarning={aiCurrencyWarning} />
          <div className="form-wide actions">
            <button
              className="button"
              disabled={busy || aiBusyKey !== null || generating || filesBusy}
            >
              {locked
                ? labelsLocked
                  ? t("saveAttachments")
                  : t("saveChanges")
                : editing
                  ? t("saveInvoice")
                  : t("createInvoice")}
            </button>
          </div>
          {error && <p className="form-wide notice notice-error">{error}</p>}
          {filesError && (
            <p className="form-wide notice notice-error">{filesError}</p>
          )}
          {accountingDialog}
        </form>
      )}
    </FormPage>
  );
}

export function CategoryForm({
  category,
}: {
  category?: Category & { code: string };
}) {
  const { t } = useLocale();
  const path = "/finance?section=categories";
  const { busy, error, submit } = useFinanceSubmit(path);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      category
        ? {
            action: "updateCategory",
            categoryId: category.id,
            nameEn: form.get("nameEn"),
            nameSv: form.get("nameSv"),
            active: form.get("active") === "on",
          }
        : {
            action: "createCategory",
            code: form.get("code"),
            nameEn: form.get("nameEn"),
            nameSv: form.get("nameSv"),
            direction: form.get("direction"),
          },
    );
  }
  return (
    <FormPage
      title={t(category ? "editCategory" : "addCategory")}
      description={t(
        category ? "editCategoryDescription" : "newCategoryDescription",
      )}
      backHref={path}
      backLabel={t("backToCategories")}
    >
      <form className="form-grid" onSubmit={onSubmit}>
        {!category && (
          <label>
            {t("categoryCode")}
            <input
              className="field"
              name="code"
              pattern="[a-z][a-z0-9_]+"
              required
            />
          </label>
        )}
        <label>
          {t("englishName")}
          <input
            className="field"
            name="nameEn"
            defaultValue={category?.name.en}
            required
          />
        </label>
        <label>
          {t("swedishName")}
          <input
            className="field"
            name="nameSv"
            defaultValue={category?.name.sv}
            required
          />
        </label>
        {!category ? (
          <label>
            {t("type")}
            <select className="field" name="direction">
              <option value="income">{t("income")}</option>
              <option value="expense">{t("expense")}</option>
            </select>
          </label>
        ) : (
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="active"
              defaultChecked={category.active}
            />
            {t("active")}
          </label>
        )}
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
            {category ? t("saveChanges") : t("addCategory")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
      </form>
    </FormPage>
  );
}

export function TransactionForm({
  users,
  categories,
  returnHref = "/finance?section=transactions",
  defaultDate,
  transaction,
  receipt,
  incomingEmail,
  accountingRecipients = [],
  aiEnabled = false,
}: {
  users: User[];
  categories: Category[];
  returnHref?: string;
  defaultDate?: string;
  transaction?: EditableTransaction;
  receipt?: ExpenseReceipt;
  /** A forwarded email whose AI reading and files fill the form. */
  incomingEmail?: IncomingEmailSource;
  aiEnabled?: boolean;
  /** Accounting contacts to offer emailing the saved entry to. */
  accountingRecipients?: string[];
}) {
  const { t, locale } = useLocale();
  const receiptConsultant = receipt
    ? users.find((user) => user.id === receipt.userId)
    : undefined;
  const [direction, setDirection] = useState<"" | "income" | "expense">(
    transaction?.direction ?? (receipt ? "expense" : ""),
  );
  const [consultantId, setConsultantId] = useState(
    transaction
      ? (transaction.consultantId ?? COMPANY_ONLY)
      : receipt
        ? (receiptConsultant?.id ?? COMPANY_ONLY)
        : "",
  );
  const hasConsultant = consultantId !== "" && consultantId !== COMPANY_ONLY;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<TransactionField, string>>
  >({});
  const clearFieldError = (field: TransactionField) =>
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[field];
      return next;
    });
  // Amounts whose VAT does not follow from the rate (rounded receipt lines)
  // open in net-and-VAT mode so the exact VAT is kept.
  const initialVatRateBps =
    transaction?.vatRateBps ??
    (receipt ? receiptVatRateBps(receipt.netMinor, receipt.vatMinor) : 0);
  const initialAmounts = transaction
    ? {
        netMinor: transaction.netMinor,
        vatMinor:
          transaction.grossMinor -
          transaction.netMinor -
          transaction.roundingMinor,
      }
    : receipt?.netMinor
      ? { netMinor: receipt.netMinor, vatMinor: receipt.vatMinor }
      : null;
  const initialExactVat =
    initialAmounts !== null &&
    calculateVatMinor(initialAmounts.netMinor, initialVatRateBps) !==
      initialAmounts.vatMinor;
  const [amountMode, setAmountMode] = useState<TransactionAmountMode>(
    initialExactVat ? "netVat" : receipt && !transaction ? "net" : "gross",
  );
  const [amount, setAmount] = useState(
    initialExactVat
      ? (initialAmounts.netMinor / 100).toFixed(2)
      : transaction
        ? (transaction.grossMinor / 100).toFixed(2)
        : receipt?.netMinor
          ? (receipt.netMinor / 100).toFixed(2)
          : "",
  );
  const [vatAmount, setVatAmount] = useState(
    initialAmounts ? (initialAmounts.vatMinor / 100).toFixed(2) : "",
  );
  const [rounding, setRounding] = useState(
    transaction?.roundingMinor
      ? (transaction.roundingMinor / 100).toFixed(2)
      : "",
  );
  const [funding, setFunding] = useState<"" | "company" | "consultant">(
    transaction?.funding ?? "",
  );
  const [vatPercent, setVatPercent] = useState(String(initialVatRateBps / 100));
  const [applyShare, setApplyShare] = useState(
    transaction?.applyConsultantShare ?? false,
  );
  const [sharePercent, setSharePercent] = useState(
    transaction?.shareBpsOverride != null
      ? String(transaction.shareBpsOverride / 100)
      : "",
  );
  const [pendingMonthMismatch, setPendingMonthMismatch] = useState<{
    payload: Record<string, unknown>;
    viewMonth: string;
    transactionMonth: string;
  } | null>(null);
  const [pendingVatMismatch, setPendingVatMismatch] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const { busy, error, submit, accountingDialog } = useFinanceSubmit(
    returnHref,
    { entityType: "transaction", recipients: accountingRecipients },
  );
  const [receiptFileError, setReceiptFileError] = useState(false);
  const [emailFilesFailed, setEmailFilesFailed] = useState(false);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [date, setDate] = useState(
    transaction?.date ?? receipt?.date ?? defaultDate ?? today(),
  );
  const receiptText = receipt
    ? [receipt.name, receipt.description].filter(Boolean).join(" – ")
    : "";
  const [internalNote, setInternalNote] = useState(
    transaction?.internalNote ??
      (receipt ? `${t("receipt")}: ${receiptText} (${receipt.userName})` : ""),
  );
  const [visibleDescription, setVisibleDescription] = useState(
    transaction?.visibleDescription ?? receiptText,
  );
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiProcessedKeys, setAiProcessedKeys] = useState<string[]>([]);
  const [aiCurrencyWarning, setAiCurrencyWarning] = useState<string[] | null>(
    null,
  );
  const [aiNotice, setAiNotice] = useState<AiNotice | null>(null);

  /** Fills the form from an AI reading of a file or forwarded email. */
  function applyExtraction(extraction: FinanceExtraction, name: string) {
    let filled = 0;
    const foreignAmounts = extraction.currency !== "SEK";
    if (extraction.direction) {
      setDirection(extraction.direction);
      clearFieldError("direction");
      filled++;
    }
    if (extraction.date) {
      setDate(extraction.date);
      filled++;
    }
    const exactVat =
      !foreignAmounts &&
      extraction.netMinor !== null &&
      extraction.netMinor > 0 &&
      extraction.vatMinor !== null;
    if (foreignAmounts) {
      // No exchange rate was found, so leave the SEK amount for the user.
    } else if (exactVat) {
      setAmountMode("netVat");
      setAmount((extraction.netMinor! / 100).toFixed(2));
      setVatAmount((extraction.vatMinor! / 100).toFixed(2));
      filled++;
    } else if (extraction.grossMinor !== null && extraction.grossMinor > 0) {
      setAmountMode("gross");
      setAmount((extraction.grossMinor / 100).toFixed(2));
      filled++;
    } else if (extraction.netMinor !== null && extraction.netMinor > 0) {
      setAmountMode("net");
      setAmount((extraction.netMinor / 100).toFixed(2));
      filled++;
    }
    if (!foreignAmounts)
      setRounding(
        extraction.roundingMinor
          ? (extraction.roundingMinor / 100).toFixed(2)
          : "",
      );
    if (extraction.vatRateBps !== null) {
      setVatPercent(String(extraction.vatRateBps / 100));
      filled++;
    }
    if (extraction.categoryId) {
      setCategoryId(extraction.categoryId);
      clearFieldError("categoryId");
      filled++;
    }
    const consultantFound = users.some(
      (user) => user.id === extraction.consultantId,
    );
    if (consultantFound) {
      setConsultantId(extraction.consultantId!);
      clearFieldError("consultantId");
      filled++;
    }
    if (extraction.funding && extraction.direction !== "income") {
      setFunding(extraction.funding);
      clearFieldError("funding");
      filled++;
    }
    const consultantText = [extraction.counterpartyName, extraction.description]
      .filter(Boolean)
      .join(" – ");
    if (consultantText && !visibleDescription.trim())
      setVisibleDescription(consultantText);
    const conversionText = aiConversionText(extraction, t, locale);
    const summary = [
      extraction.counterpartyName,
      extraction.description,
      conversionText,
    ]
      .filter(Boolean)
      .join(" – ");
    if (summary && !internalNote.trim()) {
      setInternalNote(summary);
      filled++;
    }
    setAiCurrencyWarning(aiCurrencyWarningLines(extraction, conversionText, t));
    if (!filled) {
      setAiNotice({
        tone: "warning",
        messages: [t("aiNothingFound").replace("{name}", name)],
      });
      return;
    }
    const messages = [t("aiFilledFromFile").replace("{name}", name)];
    if (
      !foreignAmounts &&
      !exactVat &&
      extraction.netMinor !== null &&
      extraction.vatMinor !== null &&
      extraction.vatRateBps !== null &&
      calculateVatMinor(extraction.netMinor, extraction.vatRateBps) !==
        extraction.vatMinor
    )
      messages.push(
        t("aiVatDiffers").replace(
          "{vat}",
          formatSek(extraction.vatMinor, locale),
        ),
      );
    if (
      !extraction.direction ||
      !extraction.categoryId ||
      (!consultantFound && !consultantId)
    )
      messages.push(t("aiChooseRemaining"));
    setAiNotice({
      tone: "success",
      messages,
    });
  }

  async function processWithAi(
    source: AiAttachmentSource,
    key: string,
    name: string,
  ) {
    setAiBusyKey(key);
    setAiNotice(null);
    setAiCurrencyWarning(null);
    const result = await processAttachmentWithAi(source);
    setAiBusyKey(null);
    const extraction = result.extraction;
    if (!extraction) {
      setAiNotice(aiErrorNotice(result, t));
      return;
    }
    setAiProcessedKeys((keys) => [...keys, key]);
    applyExtraction(extraction, name);
  }

  useIncomingEmailPrefill(incomingEmail, (files, failed) => {
    setAttachmentFiles(files);
    setEmailFilesFailed(failed);
    if (incomingEmail?.extraction)
      applyExtraction(
        incomingEmail.extraction,
        incomingEmail.subject || t("incomingEmailSourceName"),
      );
  });
  useEffect(() => {
    if (!receipt) return;
    let active = true;
    void appCheckFetch(`/api/receipts/${encodeURIComponent(receipt.id)}/file`)
      .then(async (response) => {
        if (!response.ok) throw new Error("receiptFileUnavailable");
        const blob = await response.blob();
        if (active)
          setAttachmentFiles([
            new File([blob], receipt.fileName, { type: receipt.contentType }),
          ]);
      })
      .catch(() => {
        if (active) setReceiptFileError(true);
      });
    return () => {
      active = false;
    };
  }, [receipt]);
  const vatRateBps = Math.round(Number(vatPercent || 0) * 100);
  const roundingMinor = (() => {
    try {
      return parseSignedSek(rounding);
    } catch {
      return 0;
    }
  })();
  const amountSummary = useMemo(() => {
    try {
      return calculateTransactionAmounts(
        amountMode,
        parseSek(amount || 0),
        vatRateBps,
        amountMode === "netVat" ? parseSek(vatAmount || 0) : null,
        roundingMinor,
      );
    } catch {
      return { netMinor: 0, vatMinor: 0, roundingMinor: 0, grossMinor: 0 };
    }
  }, [amount, amountMode, vatAmount, vatRateBps, roundingMinor]);
  const expectedVatMinor = calculateVatMinor(
    amountSummary.netMinor,
    vatRateBps,
  );
  const availableCategories = categories
    .filter(
      (item) =>
        (item.active || item.id === transaction?.categoryId) &&
        item.direction === direction,
    )
    .sort((left, right) => {
      const isOther = (item: Category) =>
        item.code.trim().toLowerCase().startsWith("other") ||
        item.name.en.trim().toLowerCase().startsWith("other") ||
        item.name.sv.trim().toLocaleLowerCase("sv").startsWith("\u00f6vrig");
      const leftOther = isOther(left);
      const rightOther = isOther(right);
      if (leftOther !== rightOther) return leftOther ? 1 : -1;
      const language = locale === "sv-SE" ? "sv" : "en";
      return left.name[language].localeCompare(right.name[language], locale);
    });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<TransactionField, string>> = {};
    if (!direction) errors.direction = t("selectTypeError");
    if (!availableCategories.some((item) => item.id === categoryId))
      errors.categoryId = t("selectCategoryError");
    if (!consultantId) errors.consultantId = t("selectConsultantError");
    if (direction === "expense" && hasConsultant && !funding)
      errors.funding = t("selectFundingError");
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      event.currentTarget
        .querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }
    const form = new FormData(event.currentTarget);
    const creditsConsultant =
      hasConsultant && direction === "income" && applyShare;
    const payload = {
      action: transaction ? "updateTransaction" : "createTransaction",
      ...(transaction ? { transactionId: transaction.id } : {}),
      direction,
      categoryId,
      consultantId: hasConsultant ? consultantId : null,
      date,
      amountMode,
      amountMinor: parseSek(amount),
      vatMinor: amountMode === "netVat" ? parseSek(vatAmount) : null,
      roundingMinor,
      vatRateBps,
      funding:
        direction === "expense" ? (hasConsultant ? funding : "company") : null,
      applyConsultantShare: creditsConsultant,
      shareBpsOverride:
        creditsConsultant && sharePercent
          ? Math.round(Number(sharePercent) * 100)
          : null,
      visibleDescription: hasConsultant ? visibleDescription : "",
      internalNote: form.get("internalNote"),
      ...(receipt && !transaction ? { receiptId: receipt.id } : {}),
      ...(incomingEmail && !transaction
        ? { incomingEmailId: incomingEmail.id }
        : {}),
    };
    post(payload, true);
  }

  /** Asks about VAT and month mismatches in turn, then posts. */
  function post(payload: Record<string, unknown>, checkVat: boolean) {
    if (
      checkVat &&
      amountMode === "netVat" &&
      amountSummary.vatMinor !== expectedVatMinor
    ) {
      setPendingVatMismatch(payload);
      return;
    }
    const mismatch = transaction
      ? null
      : transactionMonthMismatch(returnHref, date);
    if (mismatch) {
      setPendingMonthMismatch({ payload, ...mismatch });
      return;
    }
    void submit(payload, {
      entityType: "transaction",
      entityId: transaction?.id,
      files: attachmentFiles,
      removedAttachmentIds,
    });
  }
  return (
    <FormPage
      title={transaction ? t("editTransaction") : t("addTransaction")}
      description={
        transaction
          ? t("editTransactionDescription")
          : t("newTransactionDescription")
      }
      backHref={returnHref}
      backLabel={
        receipt
          ? t("backToReceipts")
          : incomingEmail
            ? t("backToIncomingEmails")
            : t("backToTransactions")
      }
      notice={
        incomingEmail ? (
          <IncomingEmailNotice
            email={incomingEmail}
            filesFailed={emailFilesFailed}
          />
        ) : (
          receipt && (
            <div className="notice notice-success receipt-expense-notice">
              <strong>
                {t("expenseFromReceipt")
                  .replace("{name}", receipt.name)
                  .replace("{person}", receipt.userName)}
              </strong>
              {receipt.netMinor > 0 && (
                <span>
                  {t("expenseFromReceiptAmounts")
                    .replace("{net}", formatSek(receipt.netMinor, locale))
                    .replace("{vat}", formatSek(receipt.vatMinor, locale))
                    .replace(
                      "{total}",
                      formatSek(receipt.netMinor + receipt.vatMinor, locale),
                    )}
                </span>
              )}
              <span>
                {receiptConsultant
                  ? t("expenseFromReceiptFundingHelp")
                  : t("expenseFromReceiptCompanyOnly").replace(
                      "{person}",
                      receipt.userName,
                    )}
              </span>
              {receiptFileError && (
                <span>{t("expenseReceiptFileMissing")}</span>
              )}
            </div>
          )
        )
      }
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("type")}
          <InfoTip text={t("typeTip")} />
          <select
            className="field"
            name="direction"
            value={direction}
            aria-invalid={Boolean(fieldErrors.direction)}
            onChange={(event) => {
              setDirection(event.target.value as typeof direction);
              clearFieldError("direction");
            }}
          >
            <option value="">{t("select")}</option>
            <option value="income">{t("income")}</option>
            <option value="expense">{t("expense")}</option>
          </select>
          <FieldError message={fieldErrors.direction} />
        </label>
        <label>
          {t("category")}
          <InfoTip text={t("categoryTip")} />
          <select
            className="field"
            name="categoryId"
            value={
              availableCategories.some((item) => item.id === categoryId)
                ? categoryId
                : ""
            }
            aria-invalid={Boolean(fieldErrors.categoryId)}
            onChange={(event) => {
              setCategoryId(event.target.value);
              clearFieldError("categoryId");
            }}
          >
            <option value="">{t("select")}</option>
            {availableCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name[locale === "sv-SE" ? "sv" : "en"]}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.categoryId} />
        </label>
        <label>
          {t("consultant")}
          <InfoTip text={t("consultantTip")} />
          <select
            className="field"
            name="consultantId"
            value={consultantId}
            aria-invalid={Boolean(fieldErrors.consultantId)}
            onChange={(event) => {
              setConsultantId(event.target.value);
              clearFieldError("consultantId");
              clearFieldError("funding");
            }}
          >
            <option value="">{t("select")}</option>
            <option value={COMPANY_ONLY}>{t("companyOnly")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.consultantId} />
        </label>
        <label>
          {t("date")}
          <InfoTip text={t("dateTip")} />
          <DateInput
            className="field"
            name="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label>
          {t("amountEntryMode")}
          <InfoTip text={t("amountEntryModeTip")} />
          <select
            className="field"
            value={amountMode}
            onChange={(event) => {
              const nextMode = event.target.value as TransactionAmountMode;
              const nextAmount =
                nextMode === "gross"
                  ? amountSummary.grossMinor
                  : amountSummary.netMinor;
              setAmountMode(nextMode);
              if (amount) {
                setAmount((nextAmount / 100).toFixed(2));
                setVatAmount((amountSummary.vatMinor / 100).toFixed(2));
              }
            }}
          >
            <option value="gross">{t("enterTotalIncludingVat")}</option>
            <option value="net">{t("enterNetAmount")}</option>
            <option value="netVat">{t("enterNetAndVat")}</option>
          </select>
        </label>
        <label>
          {amountMode === "gross" ? t("totalAmountSek") : t("netAmountSek")}
          <InfoTip
            text={
              amountMode === "gross"
                ? t("totalAmountSekTip")
                : t("netAmountSekTip")
            }
          />
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        {amountMode === "netVat" && (
          <label>
            {t("vatAmountSek")}
            <InfoTip text={t("vatAmountSekTip")} />
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={vatAmount}
              onChange={(event) => setVatAmount(event.target.value)}
              required
            />
          </label>
        )}
        <label>
          {t("vatPercent")}
          <InfoTip text={t("vatPercentTip")} />
          <input
            className="field"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={vatPercent}
            onChange={(event) => setVatPercent(event.target.value)}
            required
          />
        </label>
        <label>
          {t("roundingSek")}
          <InfoTip text={t("roundingSekTip")} />
          <input
            className="field"
            type="number"
            min={-MAX_ROUNDING_MINOR / 100}
            max={MAX_ROUNDING_MINOR / 100}
            step="0.01"
            value={rounding}
            placeholder="0.00"
            onChange={(event) => setRounding(event.target.value)}
          />
        </label>
        {direction === "expense" ? (
          <label>
            {t("funding")}
            <InfoTip text={t("fundingTip")} />
            <select
              className="field"
              name="funding"
              value={hasConsultant ? funding : "company"}
              aria-invalid={Boolean(fieldErrors.funding)}
              onChange={(event) => {
                setFunding(event.target.value as typeof funding);
                clearFieldError("funding");
              }}
              disabled={!hasConsultant}
            >
              <option value="">{t("select")}</option>
              <option value="company">{t("companyFunded")}</option>
              <option value="consultant">{t("consultantFunded")}</option>
            </select>
            <FieldError message={fieldErrors.funding} />
          </label>
        ) : hasConsultant ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="applyConsultantShare"
              checked={applyShare}
              onChange={(event) => setApplyShare(event.target.checked)}
            />
            {t("applyConsultantShare")}
            <InfoTip text={t("applyConsultantShareTip")} />
          </label>
        ) : null}
        {direction !== "expense" && hasConsultant && applyShare && (
          <label>
            {t("shareOverride")}
            <InfoTip text={t("transactionShareOverrideTip")} />
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={sharePercent}
              onChange={(event) => setSharePercent(event.target.value)}
            />
          </label>
        )}
        {hasConsultant && (
          <label>
            {t("consultantDescription")}
            <InfoTip text={t("consultantDescriptionTip")} />
            <input
              className="field"
              name="visibleDescription"
              value={visibleDescription}
              onChange={(event) => setVisibleDescription(event.target.value)}
            />
          </label>
        )}
        <label>
          {t("internalNote")}
          <InfoTip text={t("internalNoteTip")} />
          <input
            className="field"
            name="internalNote"
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
          />
        </label>
        <div
          className="transaction-amount-summary form-wide"
          aria-live="polite"
        >
          <div>
            <span>{t("netAmount")}</span>
            <strong>{formatSek(amountSummary.netMinor, locale)}</strong>
          </div>
          <div>
            <span>{t("vatAmount")}</span>
            <strong>{formatSek(amountSummary.vatMinor, locale)}</strong>
          </div>
          {amountSummary.roundingMinor !== 0 && (
            <div>
              <span>{t("rounding")}</span>
              <strong>{formatSek(amountSummary.roundingMinor, locale)}</strong>
            </div>
          )}
          <div>
            <span>{t("totalIncludingVat")}</span>
            <strong>{formatSek(amountSummary.grossMinor, locale)}</strong>
          </div>
        </div>
        <FinanceAttachments
          entityType="transaction"
          entityId={transaction?.id}
          files={attachmentFiles}
          onFilesChange={setAttachmentFiles}
          removedAttachmentIds={removedAttachmentIds}
          onRemovedAttachmentIdsChange={setRemovedAttachmentIds}
          ai={
            aiEnabled
              ? {
                  busyKey: aiBusyKey,
                  processedKeys: aiProcessedKeys,
                  onProcess: processWithAi,
                }
              : undefined
          }
        />
        <AiNotices notice={aiNotice} currencyWarning={aiCurrencyWarning} />
        <div className="form-wide actions">
          <button className="button" disabled={busy || aiBusyKey !== null}>
            {transaction ? t("saveChanges") : t("postTransaction")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
        {accountingDialog}
        {pendingVatMismatch && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal modal-small"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="transaction-vat-warning-title"
              aria-describedby="transaction-vat-warning-description"
            >
              <header className="modal-header">
                <div>
                  <h2 id="transaction-vat-warning-title">
                    {t("vatMismatchTitle")}
                  </h2>
                  <p id="transaction-vat-warning-description">
                    {t("vatMismatchWarning")
                      .replace(
                        "{net}",
                        formatSek(amountSummary.netMinor, locale),
                      )
                      .replace(
                        "{rate}",
                        (vatRateBps / 100).toLocaleString(locale),
                      )
                      .replace(
                        "{expected}",
                        formatSek(expectedVatMinor, locale),
                      )
                      .replace(
                        "{vat}",
                        formatSek(amountSummary.vatMinor, locale),
                      )}
                  </p>
                </div>
              </header>
              <footer className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setPendingVatMismatch(null)}
                >
                  {t("backAndCheck")}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const payload = pendingVatMismatch;
                    setPendingVatMismatch(null);
                    post(payload, false);
                  }}
                >
                  {t("continuePosting")}
                </button>
              </footer>
            </section>
          </div>
        )}
        {pendingMonthMismatch && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal modal-small"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="transaction-month-warning-title"
              aria-describedby="transaction-month-warning-description"
            >
              <header className="modal-header">
                <div>
                  <h2 id="transaction-month-warning-title">
                    {t("transactionMonthMismatchTitle")}
                  </h2>
                  <p id="transaction-month-warning-description">
                    {t("transactionMonthMismatchWarning")
                      .replace(
                        "{viewMonth}",
                        formatMonth(pendingMonthMismatch.viewMonth, locale),
                      )
                      .replace(
                        "{transactionType}",
                        t(direction || "income").toLocaleLowerCase(locale),
                      )
                      .replace(
                        "{transactionMonth}",
                        formatMonth(
                          pendingMonthMismatch.transactionMonth,
                          locale,
                        ),
                      )}
                  </p>
                </div>
              </header>
              <footer className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setPendingMonthMismatch(null)}
                >
                  {t("backAndCorrect")}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const payload = pendingMonthMismatch.payload;
                    setPendingMonthMismatch(null);
                    void submit(payload, {
                      entityType: "transaction",
                      entityId: transaction?.id,
                      files: attachmentFiles,
                      removedAttachmentIds,
                    });
                  }}
                >
                  {t("continuePosting")}
                </button>
              </footer>
            </section>
          </div>
        )}
      </form>
    </FormPage>
  );
}

export type EditableCustomer = {
  id: string;
  name: string;
  contactPerson: string;
  financeEmail: string;
  customerNumber: string;
  orgNumber: string;
  vatNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  defaultYourReference: string;
  paymentTermsDays: number | null;
  invoiceLocale: "sv-SE" | "en-SE";
};

export function CustomerForm({
  customer,
  nextCustomerNumber,
}: {
  customer?: EditableCustomer;
  /** Shown as the number a new customer gets when left blank. */
  nextCustomerNumber?: number;
}) {
  const { t } = useLocale();
  const { busy, error, submit } = useFinanceSubmit(
    "/finance?section=customers",
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const terms = text("paymentTermsDays");
    void submit({
      action: customer ? "updateCustomer" : "createCustomer",
      ...(customer ? { customerId: customer.id } : {}),
      name: text("name"),
      contactPerson: text("contactPerson"),
      financeEmail: text("financeEmail"),
      customerNumber: text("customerNumber"),
      orgNumber: text("orgNumber"),
      vatNumber: text("vatNumber"),
      addressLine: text("addressLine"),
      postalCode: text("postalCode"),
      city: text("city"),
      country: text("country"),
      defaultYourReference: text("defaultYourReference"),
      paymentTermsDays: terms ? Math.round(Number(terms)) : null,
      invoiceLocale: text("invoiceLocale") === "en-SE" ? "en-SE" : "sv-SE",
    });
  }
  return (
    <FormPage
      title={t(customer ? "editCustomer" : "addCustomer")}
      description={t(
        customer ? "editCustomerDescription" : "newCustomerDescription",
      )}
      backHref="/finance?section=customers"
      backLabel={t("backToCustomers")}
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("customerName")}
          <input
            className="field"
            name="name"
            defaultValue={customer?.name}
            required
          />
        </label>
        <label>
          {t("contactPerson")}
          <input
            className="field"
            name="contactPerson"
            defaultValue={customer?.contactPerson}
            required
          />
        </label>
        <label>
          {t("financeDepartmentEmail")}
          <input
            className="field"
            type="email"
            name="financeEmail"
            defaultValue={customer?.financeEmail}
            required
          />
        </label>
        <label>
          {t("customerNumber")}
          <InfoTip text={t("customerNumberTip")} />
          <input
            className="field"
            name="customerNumber"
            defaultValue={customer?.customerNumber}
            placeholder={
              nextCustomerNumber ? String(nextCustomerNumber) : undefined
            }
          />
        </label>
        <fieldset className="access-section form-wide">
          <legend>{t("customerInvoiceDetails")}</legend>
          <div className="form-grid">
            <label className="form-wide">
              {t("invoiceSetting_addressLine")}
              <input
                className="field"
                name="addressLine"
                defaultValue={customer?.addressLine}
              />
            </label>
            <label>
              {t("invoiceSetting_postalCode")}
              <input
                className="field"
                name="postalCode"
                defaultValue={customer?.postalCode}
              />
            </label>
            <label>
              {t("invoiceSetting_city")}
              <input
                className="field"
                name="city"
                defaultValue={customer?.city}
              />
            </label>
            <label>
              {t("invoiceSetting_country")}
              <input
                className="field"
                name="country"
                defaultValue={customer?.country || "Sverige"}
              />
            </label>
            <label>
              {t("invoiceSetting_orgNumber")}
              <input
                className="field"
                name="orgNumber"
                defaultValue={customer?.orgNumber}
              />
            </label>
            <label>
              {t("invoiceSetting_vatNumber")}
              <InfoTip text={t("customerVatNumberTip")} />
              <input
                className="field"
                name="vatNumber"
                defaultValue={customer?.vatNumber}
              />
            </label>
            <label>
              {t("defaultYourReference")}
              <InfoTip text={t("defaultYourReferenceTip")} />
              <input
                className="field"
                name="defaultYourReference"
                defaultValue={customer?.defaultYourReference}
              />
            </label>
            <label>
              {t("customerPaymentTermsDays")}
              <InfoTip text={t("customerPaymentTermsDaysTip")} />
              <input
                className="field"
                type="number"
                min="0"
                max="365"
                step="1"
                name="paymentTermsDays"
                defaultValue={customer?.paymentTermsDays ?? ""}
              />
            </label>
            <label>
              {t("invoiceLanguage")}
              <select
                className="field"
                name="invoiceLocale"
                defaultValue={customer?.invoiceLocale ?? "sv-SE"}
              >
                <option value="sv-SE">Svenska</option>
                <option value="en-SE">English</option>
              </select>
            </label>
          </div>
        </fieldset>
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
            {t("saveCustomer")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
      </form>
    </FormPage>
  );
}

export function ImportPage({ kind }: { kind: "invoices" | "transactions" }) {
  const { t } = useLocale();
  return (
    <FormPage
      title={t("csvImport")}
      description={t("csvImportDescription")}
      backHref={`/finance?section=${kind}`}
      backLabel={t(
        kind === "invoices" ? "backToInvoices" : "backToTransactions",
      )}
    >
      <FinanceImport kind={kind} />
    </FormPage>
  );
}

function FinanceImport({ kind }: { kind: "invoices" | "transactions" }) {
  return (
    <FinanceCsvImport
      allowedKinds={
        kind === "invoices"
          ? ["invoices"]
          : ["transactions", "income", "expenses"]
      }
    />
  );
}

/** An invoice article as its form edits it. */
export type EditableArticle = InvoiceArticle;

export function ArticleForm({
  article,
  users,
}: {
  article?: EditableArticle;
  users: User[];
}) {
  const { t } = useLocale();
  const { busy, error, submit } = useFinanceSubmit("/finance?section=articles");
  const [validFrom, setValidFrom] = useState(article?.validFrom ?? today());
  const [validTo, setValidTo] = useState(article?.validTo ?? "");
  const [priceError, setPriceError] = useState("");
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    let unitPriceMinor: number;
    try {
      unitPriceMinor = parseSignedSek(text("unitPrice"));
    } catch {
      setPriceError(t("articlePriceInvalid"));
      return;
    }
    setPriceError("");
    void submit({
      action: article ? "updateArticle" : "createArticle",
      ...(article ? { articleId: article.id } : {}),
      articleNumber: text("articleNumber"),
      description: text("description"),
      unit: text("unit"),
      unitPriceMinor,
      consultantScope: text("consultantScope") || ARTICLE_FOR_ALL,
      vatRateBps: Math.round(Number(text("vatPercent") || 0) * 100),
      validFrom,
      validTo: validTo || null,
    });
  }
  return (
    <FormPage
      title={t(article ? "editArticle" : "addArticle")}
      description={t(
        article ? "editArticleDescription" : "newArticleDescription",
      )}
      backHref="/finance?section=articles"
      backLabel={t("backToArticles")}
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("invoiceLineArticle")}
          <InfoTip text={t("articleNumberTip")} />
          <input
            className="field"
            name="articleNumber"
            maxLength={20}
            defaultValue={article?.articleNumber}
            required
          />
        </label>
        <label>
          {t("invoiceLineDescription")}
          <InfoTip text={t("articleDescriptionTip")} />
          <input
            className="field"
            name="description"
            maxLength={200}
            defaultValue={article?.description}
            required
          />
        </label>
        <label>
          {t("invoiceLineUnit")}
          <input
            className="field"
            name="unit"
            list="article-units"
            maxLength={10}
            defaultValue={article?.unit ?? "h"}
            required
          />
          <datalist id="article-units">
            {INVOICE_UNITS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </label>
        <label>
          {t("invoiceLineUnitPrice")}
          <input
            className="field"
            name="unitPrice"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              article ? (article.unitPriceMinor / 100).toFixed(2) : undefined
            }
            required
          />
          <FieldError message={priceError} />
        </label>
        <label>
          {t("vatPercent")}
          <input
            className="field"
            type="number"
            name="vatPercent"
            min="0"
            max="100"
            step="0.01"
            defaultValue={article ? article.vatRateBps / 100 : 25}
            required
          />
        </label>
        <label>
          {t("articleConsultant")}
          <InfoTip text={t("articleConsultantTip")} />
          <select
            className="field"
            name="consultantScope"
            defaultValue={article?.consultantScope ?? ARTICLE_FOR_ALL}
          >
            <option value={ARTICLE_FOR_ALL}>{t("articleForAll")}</option>
            <option value={ARTICLE_FOR_COMPANY}>{t("companyOnly")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("articleValidFrom")}
          <DateInput
            className="field"
            name="validFrom"
            value={validFrom}
            max={validTo || undefined}
            onChange={(event) => setValidFrom(event.target.value)}
            required
          />
        </label>
        <label>
          {t("articleValidTo")}
          <InfoTip text={t("articleValidToTip")} />
          <DateInput
            className="field"
            name="validTo"
            value={validTo}
            min={validFrom || undefined}
            onChange={(event) => setValidTo(event.target.value)}
          />
        </label>
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
            {t("saveArticle")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
      </form>
    </FormPage>
  );
}
