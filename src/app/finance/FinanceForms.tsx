"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  calculateVatMinor,
  calculateTransactionAmounts,
  formatSek,
  parseSek,
} from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import { FinanceCsvImport } from "./FinanceCsvImport";
import { transactionMonthMismatch } from "./transaction-navigation";
import {
  FinanceAttachments,
  uploadFinanceAttachments,
} from "./FinanceAttachments";

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
  children,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
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
      <section className="card">{children}</section>
    </>
  );
}

function useFinanceSubmit(successPath: string) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(
    payload: Record<string, unknown>,
    attachment?: {
      entityType: "transaction";
      entityId?: string;
      files: File[];
    },
  ) {
    setBusy(true);
    setError("");
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
      if (attachment?.files.length) {
        const upload = await uploadFinanceAttachments(
          attachment.entityType,
          attachment.entityId ?? result.id ?? "",
          attachment.files,
        );
        if (!upload.ok) {
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
  const { busy, error, submit } = useFinanceSubmit("/finance?section=invoices");
  const netMinor = parseSek(netAmount);
  const vatMinor = Number.isFinite(Number(vatPercent))
    ? calculateVatMinor(netMinor, Math.round(Number(vatPercent) * 100))
    : 0;
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({
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
    });
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
}: {
  users: User[];
  categories: Category[];
  returnHref?: string;
  defaultDate?: string;
  transaction?: EditableTransaction;
}) {
  const { t, locale } = useLocale();
  const [direction, setDirection] = useState<"income" | "expense">(
    transaction?.direction ?? "income",
  );
  const [consultantId, setConsultantId] = useState(
    transaction?.consultantId ?? "",
  );
  const [amountMode, setAmountMode] = useState<"net" | "gross">("gross");
  const [amount, setAmount] = useState(
    transaction ? (transaction.grossMinor / 100).toFixed(2) : "",
  );
  const [funding, setFunding] = useState<"company" | "consultant">(
    transaction?.funding ?? "company",
  );
  const [vatPercent, setVatPercent] = useState(
    String((transaction?.vatRateBps ?? 0) / 100),
  );
  const [pendingMonthMismatch, setPendingMonthMismatch] = useState<{
    payload: Record<string, unknown>;
    viewMonth: string;
    transactionMonth: string;
  } | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const { busy, error, submit } = useFinanceSubmit(returnHref);
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
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") ?? "");
    const payload = {
      action: transaction ? "updateTransaction" : "createTransaction",
      ...(transaction ? { transactionId: transaction.id } : {}),
      direction,
      categoryId: form.get("categoryId"),
      consultantId: consultantId || null,
      date,
      amountMode,
      amountMinor: parseSek(amount),
      vatRateBps,
      funding:
        direction === "expense" ? (consultantId ? funding : "company") : null,
      applyConsultantShare:
        Boolean(consultantId) && form.get("applyConsultantShare") === "on",
      visibleDescription: consultantId
        ? String(form.get("visibleDescription") ?? "")
        : "",
      internalNote: form.get("internalNote"),
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
      backLabel={t("backToTransactions")}
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          {t("type")}
          <select
            className="field"
            name="direction"
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as typeof direction)
            }
          >
            <option value="income">{t("income")}</option>
            <option value="expense">{t("expense")}</option>
          </select>
        </label>
        <label>
          {t("category")}
          <select
            className="field"
            name="categoryId"
            defaultValue={transaction?.categoryId ?? ""}
            required
          >
            <option value="">{t("selectCategory")}</option>
            {availableCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name[locale === "sv-SE" ? "sv" : "en"]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("consultant")}
          <select
            className="field"
            name="consultantId"
            value={consultantId}
            onChange={(event) => {
              const nextConsultantId = event.target.value;
              setConsultantId(nextConsultantId);
              if (!nextConsultantId) setFunding("company");
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
          {t("date")}
          <input
            className="field"
            type="date"
            name="date"
            defaultValue={transaction?.date ?? defaultDate ?? today()}
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
              value={consultantId ? funding : "company"}
              onChange={(event) =>
                setFunding(event.target.value as typeof funding)
              }
              disabled={!consultantId}
            >
              <option value="company">{t("companyFunded")}</option>
              <option value="consultant">{t("consultantFunded")}</option>
            </select>
          </label>
        ) : consultantId ? (
          <label className="checkbox">
            <input
              type="checkbox"
              name="applyConsultantShare"
              defaultChecked={transaction?.applyConsultantShare ?? false}
            />
            {t("applyConsultantShare")}
          </label>
        ) : null}
        {consultantId && (
          <label>
            {t("consultantDescription")}
            <input
              className="field"
              name="visibleDescription"
              defaultValue={transaction?.visibleDescription}
            />
          </label>
        )}
        <label>
          {t("internalNote")}
          <input
            className="field"
            name="internalNote"
            defaultValue={transaction?.internalNote}
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
        />
        <div className="form-wide actions">
          <button className="button" disabled={busy}>
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
                        t(direction).toLocaleLowerCase(locale),
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
      allowedKinds={kind === "invoices" ? ["invoices"] : ["income", "expenses"]}
    />
  );
}
