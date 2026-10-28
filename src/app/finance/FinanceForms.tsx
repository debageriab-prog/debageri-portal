"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  calculateVatMinor,
  calculateTransactionAmounts,
  formatSek,
  parseSek,
} from "@/domain/finance/calculations";
import { receiptVatRateBps } from "@/domain/receipts";
import { appCheckFetch } from "@/lib/firebase/client";
import { FinanceCsvImport } from "./FinanceCsvImport";
import { transactionMonthMismatch } from "./transaction-navigation";
import { WarningTriangleIcon } from "@/components/ui/FileActionIcons";
import {
  FinanceAttachments,
  processAttachmentWithAi,
  saveFinanceAttachmentChanges,
  type AiAttachmentSource,
} from "./FinanceAttachments";

/** Consultant select value meaning the transaction is the company's own. */
const COMPANY_ONLY = "company";

type TransactionField = "direction" | "categoryId" | "consultantId" | "funding";

const AI_ERROR_CODES = [
  "aiDisabled",
  "aiNotConfigured",
  "aiUnsupportedFile",
  "aiProviderRejected",
  "aiNoResult",
  "attachmentTooLarge",
];

type User = { id: string; displayName: string };
type Customer = { id: string; name: string };
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
  funding: "company" | "consultant" | null;
  applyConsultantShare: boolean;
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

function useFinanceSubmit(successPath: string) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      router.push(successPath);
      router.refresh();
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
  return { busy, error, submit };
}

export function CompensationForm({ users }: { users: User[] }) {
  const { t } = useLocale();
  const [model, setModel] = useState<"flexible" | "fixed">("flexible");
  const { busy, error, submit } = useFinanceSubmit(
    "/finance?section=compensation",
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({
      action: "setCompensation",
      userId: form.get("userId"),
      model,
      validFrom: form.get("validFrom"),
      validTo: form.get("validTo") || null,
      shareBps:
        model === "flexible"
          ? Math.round(Number(form.get("sharePercent")) * 100)
          : 0,
      fixedMonthlySalaryMinor:
        model === "fixed" ? parseSek(String(form.get("fixedSalary"))) : null,
    });
  }
  return (
    <FormPage
      title={t("addCompensation")}
      description={t("newCompensationDescription")}
      backHref="/finance?section=compensation"
      backLabel={t("backToCompensation")}
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("consultant")}
          <select className="field" name="userId" required>
            <option value="">{t("selectConsultant")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("compensationModel")}
          <select
            className="field"
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value as typeof model)}
          >
            <option value="flexible">{t("flexible")}</option>
            <option value="fixed">{t("fixedSalary")}</option>
          </select>
        </label>
        <label>
          {t("validFrom")}
          <input
            className="field"
            type="date"
            name="validFrom"
            defaultValue={today()}
            required
          />
        </label>
        <label>
          {t("validTo")}
          <input className="field" type="date" name="validTo" />
        </label>
        {model === "flexible" ? (
          <label>
            {t("invoiceSharePercent")}
            <input
              className="field"
              type="number"
              name="sharePercent"
              min="0"
              max="100"
              step="0.01"
              defaultValue="90"
              required
            />
          </label>
        ) : (
          <label>
            {t("monthlySalary")}
            <input
              className="field"
              type="number"
              name="fixedSalary"
              min="0.01"
              step="0.01"
              required
            />
          </label>
        )}
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
            {t("saveCompensation")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
      </form>
    </FormPage>
  );
}

export function InvoiceForm({
  users,
  customers,
}: {
  users: User[];
  customers: Customer[];
}) {
  const { t, locale } = useLocale();
  const [netAmount, setNetAmount] = useState("");
  const [vatPercent, setVatPercent] = useState("25");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const { busy, error, submit } = useFinanceSubmit("/finance?section=invoices");
  const netMinor = parseSek(netAmount);
  const vatMinor = Number.isFinite(Number(vatPercent))
    ? calculateVatMinor(netMinor, Math.round(Number(vatPercent) * 100))
    : 0;
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit(
      {
        action: "createInvoice",
        invoiceNumber: form.get("invoiceNumber"),
        consultantId: form.get("consultantId") || null,
        customerId: form.get("customerId"),
        issueDate: form.get("issueDate"),
        dueDate: form.get("dueDate"),
        netMinor,
        vatRateBps: Math.round(Number(vatPercent) * 100),
        visibleDescription: form.get("visibleDescription"),
        internalNote: form.get("internalNote"),
        shareBpsOverride: form.get("sharePercent")
          ? Math.round(Number(form.get("sharePercent")) * 100)
          : null,
      },
      { entityType: "invoice", files: attachmentFiles, removedAttachmentIds },
    );
  }
  return (
    <FormPage
      title={t("addInvoice")}
      description={t("newInvoiceDescription")}
      backHref="/finance?section=invoices"
      backLabel={t("backToInvoices")}
    >
      {!customers.length ? (
        <p className="notice notice-error">
          {t("noCustomersForInvoice")}{" "}
          <Link href="/finance/customers/new">{t("addCustomer")}</Link>
        </p>
      ) : (
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            {t("invoiceNumber")}
            <input className="field" name="invoiceNumber" required />
          </label>
          <label>
            {t("customer")}
            <select className="field" name="customerId" required>
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
            <select className="field" name="consultantId">
              <option value="">{t("companyOnly")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("issueDate")}
            <input
              className="field"
              type="date"
              name="issueDate"
              defaultValue={today()}
              required
            />
          </label>
          <label>
            {t("dueDate")}
            <input
              className="field"
              type="date"
              name="dueDate"
              defaultValue={today()}
              required
            />
          </label>
          <label>
            {t("netAmountSek")}
            <input
              className="field"
              type="number"
              name="netAmount"
              min="0.01"
              step="0.01"
              value={netAmount}
              onChange={(event) => setNetAmount(event.target.value)}
              required
            />
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
              value={vatPercent}
              onChange={(event) => setVatPercent(event.target.value)}
              required
            />
          </label>
          <div className="metric">
            <span>{t("totalIncludingVat")}</span>
            <strong>{formatSek(netMinor + vatMinor, locale)}</strong>
          </div>
          <label>
            {t("shareOverride")}
            <input
              className="field"
              type="number"
              name="sharePercent"
              min="0"
              max="100"
              step="0.01"
            />
          </label>
          <label>
            {t("consultantDescription")}
            <input className="field" name="visibleDescription" />
          </label>
          <label>
            {t("internalNote")}
            <input className="field" name="internalNote" />
          </label>
          <FinanceAttachments
            entityType="invoice"
            files={attachmentFiles}
            onFilesChange={setAttachmentFiles}
            removedAttachmentIds={removedAttachmentIds}
            onRemovedAttachmentIdsChange={setRemovedAttachmentIds}
          />
          <div className="form-wide actions">
            <button className="button" disabled={busy}>
              {t("createInvoice")}
            </button>
          </div>
          {error && <p className="form-wide notice notice-error">{error}</p>}
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
            {t("code")}
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
          <label className="checkbox">
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
  aiEnabled = false,
}: {
  users: User[];
  categories: Category[];
  returnHref?: string;
  defaultDate?: string;
  transaction?: EditableTransaction;
  receipt?: ExpenseReceipt;
  aiEnabled?: boolean;
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
  const [amountMode, setAmountMode] = useState<"net" | "gross">(
    receipt && !transaction ? "net" : "gross",
  );
  const [amount, setAmount] = useState(
    transaction
      ? (transaction.grossMinor / 100).toFixed(2)
      : receipt?.netMinor
        ? (receipt.netMinor / 100).toFixed(2)
        : "",
  );
  const [funding, setFunding] = useState<"" | "company" | "consultant">(
    transaction?.funding ?? "",
  );
  const [vatPercent, setVatPercent] = useState(
    String(
      (transaction?.vatRateBps ??
        (receipt ? receiptVatRateBps(receipt.netMinor, receipt.vatMinor) : 0)) /
        100,
    ),
  );
  const [pendingMonthMismatch, setPendingMonthMismatch] = useState<{
    payload: Record<string, unknown>;
    viewMonth: string;
    transactionMonth: string;
  } | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const { busy, error, submit } = useFinanceSubmit(returnHref);
  const [receiptFileError, setReceiptFileError] = useState(false);
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
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiCurrencyWarning, setAiCurrencyWarning] = useState<string[] | null>(
    null,
  );
  const [aiNotice, setAiNotice] = useState<{
    tone: "success" | "warning" | "error";
    messages: string[];
  } | null>(null);

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
      const code = AI_ERROR_CODES.includes(result.error ?? "")
        ? result.error
        : "aiProviderFailed";
      setAiNotice({
        tone: "error",
        messages: [
          t(`aiError_${code}` as Parameters<typeof t>[0]),
          ...(result.detail
            ? [t("aiProviderSaid").replace("{detail}", result.detail)]
            : []),
        ],
      });
      return;
    }
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
    if (foreignAmounts) {
      // No exchange rate was found, so leave the SEK amount for the user.
    } else if (extraction.grossMinor !== null && extraction.grossMinor > 0) {
      setAmountMode("gross");
      setAmount((extraction.grossMinor / 100).toFixed(2));
      filled++;
    } else if (extraction.netMinor !== null && extraction.netMinor > 0) {
      setAmountMode("net");
      setAmount((extraction.netMinor / 100).toFixed(2));
      filled++;
    }
    if (extraction.vatRateBps !== null) {
      setVatPercent(String(extraction.vatRateBps / 100));
      filled++;
    }
    if (extraction.categoryId) {
      setCategoryId(extraction.categoryId);
      clearFieldError("categoryId");
      filled++;
    }
    const conversion = extraction.conversion;
    const conversionText = conversion
      ? t("aiConvertedCurrency")
          .replace(
            "{amount}",
            (
              (conversion.grossMinor ?? conversion.netMinor ?? 0) / 100
            ).toLocaleString(locale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          )
          .replace("{currency}", conversion.currency)
          .replace(
            "{rate}",
            conversion.rate.rate.toLocaleString(locale, {
              maximumFractionDigits: 4,
            }),
          )
          .replace(
            "{source}",
            t(`exchangeRateSource_${conversion.rate.source}`),
          )
          .replace("{date}", conversion.rate.date)
      : "";
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
    if (conversion)
      setAiCurrencyWarning([
        t("aiConversionCheck").replace("{currency}", conversion.currency),
        conversionText,
      ]);
    else if (foreignAmounts)
      setAiCurrencyWarning([
        t("aiForeignCurrency").replace("{currency}", extraction.currency),
      ]);
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
    if (!extraction.direction || !extraction.categoryId)
      messages.push(t("aiChooseRemaining"));
    setAiNotice({
      tone: messages.length > 1 ? "warning" : "success",
      messages,
    });
  }
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
  const amountSummary = useMemo(() => {
    try {
      return calculateTransactionAmounts(
        amountMode,
        parseSek(amount || 0),
        vatRateBps,
      );
    } catch {
      return { netMinor: 0, vatMinor: 0, grossMinor: 0 };
    }
  }, [amount, amountMode, vatRateBps]);
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
    const payload = {
      action: transaction ? "updateTransaction" : "createTransaction",
      ...(transaction ? { transactionId: transaction.id } : {}),
      direction,
      categoryId,
      consultantId: hasConsultant ? consultantId : null,
      date,
      amountMode,
      amountMinor: parseSek(amount),
      vatRateBps,
      funding:
        direction === "expense" ? (hasConsultant ? funding : "company") : null,
      applyConsultantShare:
        hasConsultant && form.get("applyConsultantShare") === "on",
      visibleDescription: hasConsultant
        ? String(form.get("visibleDescription") ?? "")
        : "",
      internalNote: form.get("internalNote"),
      ...(receipt && !transaction ? { receiptId: receipt.id } : {}),
    };
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
      backLabel={receipt ? t("backToReceipts") : t("backToTransactions")}
      notice={
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
            {receiptFileError && <span>{t("expenseReceiptFileMissing")}</span>}
          </div>
        )
      }
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("type")}
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
          <input
            className="field"
            type="date"
            name="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label>
          {t("amountEntryMode")}
          <select
            className="field"
            value={amountMode}
            onChange={(event) => {
              const nextMode = event.target.value as "net" | "gross";
              const nextAmount =
                nextMode === "gross"
                  ? amountSummary.grossMinor
                  : amountSummary.netMinor;
              setAmountMode(nextMode);
              if (amount) setAmount((nextAmount / 100).toFixed(2));
            }}
          >
            <option value="gross">{t("enterTotalIncludingVat")}</option>
            <option value="net">{t("enterNetAmount")}</option>
          </select>
        </label>
        <label>
          {amountMode === "gross" ? t("totalAmountSek") : t("netAmountSek")}
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
        <label>
          {t("vatPercent")}
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
        {direction === "expense" ? (
          <label>
            {t("funding")}
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
          <label className="checkbox">
            <input
              type="checkbox"
              name="applyConsultantShare"
              defaultChecked={transaction?.applyConsultantShare ?? false}
            />
            {t("applyConsultantShare")}
          </label>
        ) : null}
        {hasConsultant && (
          <label>
            {t("consultantDescription")}
            <input
              className="field"
              name="visibleDescription"
              defaultValue={transaction?.visibleDescription ?? receiptText}
            />
          </label>
        )}
        <label>
          {t("internalNote")}
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
              ? { busyKey: aiBusyKey, onProcess: processWithAi }
              : undefined
          }
        />
        {aiNotice && (
          <div
            className={`form-wide notice notice-${aiNotice.tone} ai-notice`}
            role={aiNotice.tone === "error" ? "alert" : "status"}
          >
            {aiNotice.messages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        )}
        {aiCurrencyWarning && (
          <div
            className="form-wide notice notice-error ai-currency-warning"
            role="alert"
          >
            <WarningTriangleIcon />
            <div>
              {aiCurrencyWarning.map((message) => (
                <span key={message}>{message}</span>
              ))}
            </div>
          </div>
        )}
        <div className="form-wide actions">
          <button className="button" disabled={busy || aiBusyKey !== null}>
            {transaction ? t("saveChanges") : t("postTransaction")}
          </button>
        </div>
        {error && <p className="form-wide notice notice-error">{error}</p>}
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

export function CustomerForm({
  customer,
}: {
  customer?: {
    id: string;
    name: string;
    contactPerson: string;
    financeEmail: string;
  };
}) {
  const { t } = useLocale();
  const { busy, error, submit } = useFinanceSubmit(
    "/finance?section=customers",
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({
      action: customer ? "updateCustomer" : "createCustomer",
      ...(customer ? { customerId: customer.id } : {}),
      name: form.get("name"),
      contactPerson: form.get("contactPerson"),
      financeEmail: form.get("financeEmail"),
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
