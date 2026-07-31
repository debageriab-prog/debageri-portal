"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  financeTotals,
  formatSek,
  parseSek,
} from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import { FinanceCsvImport } from "./FinanceCsvImport";

export interface FinancePageData {
  financeEnabled: boolean;
  users: Array<{
    id: string;
    displayName: string;
    employeeNumber: string;
    role: string;
    compensationModel: "flexible" | "fixed" | null;
  }>;
  categories: Array<{
    id: string;
    code: string;
    name: { en: string; sv: string };
    direction: "income" | "expense";
    active: boolean;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    consultantId: string | null;
    customerName: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
    status: "issued" | "paid" | "void";
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
    shareBps: number;
  }>;
  transactions: Array<{
    id: string;
    direction: "income" | "expense";
    categoryId: string;
    consultantId: string | null;
    invoiceId: string | null;
    date: string;
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
    consultantBalanceDeltaMinor: number;
    visibleDescription: string;
    status: "posted" | "reversal";
    reversedByTransactionId: string | null;
    createdAt: number;
  }>;
  agreements: Array<{
    id: string;
    userId: string;
    model: "flexible" | "fixed";
    validFrom: string;
    validTo: string | null;
    shareBps: number;
    fixedMonthlySalaryMinor: number | null;
  }>;
}

type Actor = { id: string; role: string; locale: "sv-SE" | "en-SE" };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function BalanceChart({
  transactions,
  locale,
  period,
  anchor,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
}) {
  const prefix =
    period === "month" ? anchor : period === "year" ? anchor.slice(0, 4) : "";
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  );
  let running = 0;
  const balances = sorted.map((transaction) => {
    running += transaction.consultantBalanceDeltaMinor;
    return { date: transaction.date, balance: running };
  });
  const filtered = prefix
    ? balances.filter((point) => point.date.startsWith(prefix))
    : balances;
  const buckets = new Map<string, { date: string; balance: number }>();
  filtered.forEach((point) => {
    const key = period === "month" ? point.date : point.date.slice(0, 7);
    buckets.set(key, point);
  });
  const visible = [...buckets.values()];
  if (!visible.length) return <div className="finance-chart-empty">—</div>;
  const values = visible.map((point) => point.balance);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = Math.max(1, max - min);
  const points = visible
    .map((point, index) => {
      const x =
        visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
      const y = 92 - ((point.balance - min) / range) * 82;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="finance-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="finance-chart-scale">
        <span>{visible[0]?.date}</span>
        <strong>{formatSek(visible.at(-1)?.balance ?? 0, locale)}</strong>
        <span>{visible.at(-1)?.date}</span>
      </div>
    </div>
  );
}

export function FinanceDashboard({
  data,
  actor,
}: {
  data: FinancePageData;
  actor: Actor;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const manager = ["admin", "accountant"].includes(actor.role);
  const admin = actor.role === "admin";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chartPeriod, setChartPeriod] = useState<"month" | "year" | "all">(
    "month",
  );
  const [chartAnchor, setChartAnchor] = useState(today().slice(0, 7));
  const [selectedConsultant, setSelectedConsultant] = useState(
    manager ? "all" : actor.id,
  );

  const categoryName = (id: string) => {
    const category = data.categories.find((item) => item.id === id);
    return category ? category.name[locale === "sv-SE" ? "sv" : "en"] : "—";
  };
  const consultantName = (id: string | null) =>
    id
      ? (data.users.find((user) => user.id === id)?.displayName ?? "—")
      : t("companyOnly");
  const visibleTransactions = useMemo(
    () =>
      selectedConsultant === "all"
        ? data.transactions
        : data.transactions.filter(
            (transaction) => transaction.consultantId === selectedConsultant,
          ),
    [data.transactions, selectedConsultant],
  );
  const totals = financeTotals(visibleTransactions);
  const earnedShare = visibleTransactions.reduce(
    (sum, transaction) =>
      sum + Math.max(0, transaction.consultantBalanceDeltaMinor),
    0,
  );
  const spentFromBalance = visibleTransactions.reduce(
    (sum, transaction) =>
      sum + Math.max(0, -transaction.consultantBalanceDeltaMinor),
    0,
  );
  const outstandingInvoices = data.invoices
    .filter(
      (invoice) =>
        invoice.status === "issued" &&
        (selectedConsultant === "all" ||
          invoice.consultantId === selectedConsultant),
    )
    .reduce((sum, invoice) => sum + invoice.grossMinor, 0);
  const consultantLiability = manager
    ? data.users
        .filter((user) => user.compensationModel === "flexible")
        .reduce(
          (sum, user) =>
            sum +
            Math.max(
              0,
              data.transactions
                .filter((transaction) => transaction.consultantId === user.id)
                .reduce(
                  (value, transaction) =>
                    value + transaction.consultantBalanceDeltaMinor,
                  0,
                ),
            ),
          0,
        )
    : totals.balanceMinor;
  const retainedResult =
    totals.netResultMinor -
    (selectedConsultant === "all" ? consultantLiability : 0);

  async function post(
    payload: Record<string, unknown>,
    successKey: Parameters<typeof t>[0],
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        const key =
          `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
            typeof t
          >[0];
        setError(t(key));
        return false;
      }
      setMessage(t(successKey));
      router.refresh();
      return true;
    } catch {
      setError(t("serverUnavailable"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitCompensation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const model = String(form.get("model"));
    await post(
      {
        action: "setCompensation",
        userId: form.get("userId"),
        model,
        validFrom: form.get("validFrom"),
        shareBps:
          model === "flexible"
            ? Math.round(Number(form.get("sharePercent")) * 100)
            : 0,
        fixedMonthlySalaryMinor:
          model === "fixed" ? parseSek(String(form.get("fixedSalary"))) : null,
      },
      "compensationSaved",
    );
  }

  if (!data.financeEnabled)
    return (
      <>
        <div className="topbar">
          <div>
            <div className="eyebrow">{t("finance")}</div>
            <h1>{t("financialOverview")}</h1>
            <p className="muted page-description">
              {t("financeDisabledDescription")}
            </p>
          </div>
        </div>
        <section className="card">
          <p>
            {admin ? t("financeEnableWarning") : t("financeAwaitingActivation")}
          </p>
          {admin && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void post({ action: "enableFinance" }, "financeEnabledMessage")
              }
            >
              {t("enableFinance")}
            </button>
          )}
          {error && <p className="notice notice-error">{error}</p>}
        </section>
      </>
    );

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await post(
        {
          action: "createCategory",
          code: form.get("code"),
          nameEn: form.get("nameEn"),
          nameSv: form.get("nameSv"),
          direction: form.get("direction"),
        },
        "categorySaved",
      )
    )
      formElement.reset();
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await post(
        {
          action: "createInvoice",
          invoiceNumber: form.get("invoiceNumber"),
          consultantId: form.get("consultantId") || null,
          customerName: form.get("customerName"),
          issueDate: form.get("issueDate"),
          dueDate: form.get("dueDate"),
          netMinor: parseSek(String(form.get("netAmount"))),
          vatRateBps: Math.round(Number(form.get("vatPercent")) * 100),
          visibleDescription: form.get("visibleDescription"),
          internalNote: form.get("internalNote"),
          shareBpsOverride: form.get("sharePercent")
            ? Math.round(Number(form.get("sharePercent")) * 100)
            : null,
        },
        "invoiceSaved",
      )
    )
      formElement.reset();
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const direction = String(form.get("direction"));
    if (
      await post(
        {
          action: "createTransaction",
          direction,
          categoryId: form.get("categoryId"),
          consultantId: form.get("consultantId") || null,
          date: form.get("date"),
          netMinor: parseSek(String(form.get("netAmount"))),
          vatRateBps: Math.round(Number(form.get("vatPercent")) * 100),
          funding: direction === "expense" ? form.get("funding") : null,
          applyConsultantShare: form.get("applyConsultantShare") === "on",
          visibleDescription: form.get("visibleDescription"),
          internalNote: form.get("internalNote"),
          importKey: null,
        },
        "transactionSaved",
      )
    )
      formElement.reset();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{manager ? t("financialOverview") : t("myFinances")}</h1>
          <p className="muted page-description">
            {manager
              ? t("financeManagementDescription")
              : t("consultantFinanceDescription")}
          </p>
        </div>
        {manager && (
          <label>
            {t("consultant")}
            <select
              className="field"
              value={selectedConsultant}
              onChange={(event) => setSelectedConsultant(event.target.value)}
            >
              <option value="all">{t("allConsultantsAndCompany")}</option>
              {data.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {(error || message) && (
        <p className={`notice ${error ? "notice-error" : "notice-success"}`}>
          {error || message}
        </p>
      )}

      <section className="finance-metrics">
        <div className="metric">
          <span>{manager ? t("netIncome") : t("earnedShare")}</span>
          <strong>
            {formatSek(manager ? totals.incomeMinor : earnedShare, locale)}
          </strong>
        </div>
        <div className="metric">
          <span>{manager ? t("netExpenses") : t("spentFromBalance")}</span>
          <strong>
            {formatSek(
              manager ? totals.expenseMinor : spentFromBalance,
              locale,
            )}
          </strong>
        </div>
        <div className="metric">
          <span>
            {manager ? t("consultantLiability") : t("remainingBalance")}
          </span>
          <strong>
            {formatSek(
              selectedConsultant === "all"
                ? consultantLiability
                : totals.balanceMinor,
              locale,
            )}
          </strong>
        </div>
        {manager && (
          <div className="metric">
            <span>{t("vatPayable")}</span>
            <strong>
              {formatSek(totals.outputVatMinor - totals.inputVatMinor, locale)}
            </strong>
          </div>
        )}
        {manager && (
          <div className="metric">
            <span>{t("retainedResult")}</span>
            <strong>{formatSek(retainedResult, locale)}</strong>
          </div>
        )}
        {manager && (
          <div className="metric">
            <span>{t("outstandingInvoices")}</span>
            <strong>{formatSek(outstandingInvoices, locale)}</strong>
          </div>
        )}
      </section>

      <section className="card finance-chart-card">
        <div className="week-head">
          <h2>{t("balanceHistory")}</h2>
          <select
            className="field finance-period"
            value={chartPeriod}
            onChange={(event) =>
              setChartPeriod(event.target.value as typeof chartPeriod)
            }
          >
            <option value="month">{t("month")}</option>
            <option value="year">{t("year")}</option>
            <option value="all">{t("allTime")}</option>
          </select>
          {chartPeriod !== "all" && (
            <input
              className="field finance-period"
              type="month"
              aria-label={t("chartPeriod")}
              value={chartAnchor}
              onChange={(event) => setChartAnchor(event.target.value)}
            />
          )}
        </div>
        <BalanceChart
          transactions={visibleTransactions}
          locale={locale}
          period={chartPeriod}
          anchor={chartAnchor}
        />
      </section>

      {manager && (
        <>
          {admin && (
            <section className="grid-2 finance-admin-grid">
              <div className="card">
                <h2>{t("compensation")}</h2>
                <form className="form-grid" onSubmit={submitCompensation}>
                  <label>
                    {t("consultant")}
                    <select className="field" name="userId" required>
                      <option value="">{t("selectConsultant")}</option>
                      {data.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("compensationModel")}
                    <select className="field" name="model" required>
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
                    {t("invoiceSharePercent")}
                    <input
                      className="field"
                      type="number"
                      name="sharePercent"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue="90"
                    />
                  </label>
                  <label>
                    {t("monthlySalary")}
                    <input
                      className="field"
                      type="number"
                      name="fixedSalary"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                    />
                  </label>
                  <div className="form-wide actions">
                    <button className="button" disabled={busy}>
                      {t("saveCompensation")}
                    </button>
                  </div>
                </form>
              </div>
              <div className="card">
                <h2>{t("financeCategories")}</h2>
                <form className="form-grid" onSubmit={submitCategory}>
                  <label>
                    {t("code")}
                    <input
                      className="field"
                      name="code"
                      pattern="[a-z][a-z0-9_]+"
                      required
                    />
                  </label>
                  <label>
                    {t("englishName")}
                    <input className="field" name="nameEn" required />
                  </label>
                  <label>
                    {t("swedishName")}
                    <input className="field" name="nameSv" required />
                  </label>
                  <label>
                    {t("type")}
                    <select className="field" name="direction">
                      <option value="income">{t("income")}</option>
                      <option value="expense">{t("expense")}</option>
                    </select>
                  </label>
                  <div className="form-wide actions">
                    <button className="button" disabled={busy}>
                      {t("addCategory")}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          <section className="card">
            <h2>{t("newInvoice")}</h2>
            <form className="form-grid" onSubmit={submitInvoice}>
              <label>
                {t("invoiceNumber")}
                <input className="field" name="invoiceNumber" required />
              </label>
              <label>
                {t("customer")}
                <input className="field" name="customerName" required />
              </label>
              <label>
                {t("consultant")}
                <select className="field" name="consultantId">
                  <option value="">{t("companyOnly")}</option>
                  {data.users.map((user) => (
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
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
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
                  defaultValue="25"
                  required
                />
              </label>
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
            </form>
          </section>

          <section className="card">
            <h2>{t("newTransaction")}</h2>
            <form className="form-grid" onSubmit={submitTransaction}>
              <label>
                {t("type")}
                <select className="field" name="direction">
                  <option value="income">{t("income")}</option>
                  <option value="expense">{t("expense")}</option>
                </select>
              </label>
              <label>
                {t("category")}
                <select className="field" name="categoryId" required>
                  <option value="">{t("selectCategory")}</option>
                  {data.categories
                    .filter((category) => category.active)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {categoryName(category.id)} · {t(category.direction)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t("consultant")}
                <select className="field" name="consultantId">
                  <option value="">{t("companyOnly")}</option>
                  {data.users.map((user) => (
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
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
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
                  defaultValue="0"
                />
              </label>
              <label>
                {t("funding")}
                <select className="field" name="funding">
                  <option value="company">{t("companyFunded")}</option>
                  <option value="consultant">{t("consultantFunded")}</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="applyConsultantShare" />
                {t("applyConsultantShare")}
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
                  {t("postTransaction")}
                </button>
              </div>
            </form>
          </section>
          <FinanceCsvImport />
        </>
      )}

      {manager && (
        <section className="card table-wrap">
          <h2>{t("invoices")}</h2>
          <table>
            <thead>
              <tr>
                <th>{t("invoiceNumber")}</th>
                <th>{t("customer")}</th>
                <th>{t("consultant")}</th>
                <th>{t("issueDate")}</th>
                <th>{t("netAmount")}</th>
                <th>{t("status")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.customerName}</td>
                  <td>{consultantName(invoice.consultantId)}</td>
                  <td>{invoice.issueDate}</td>
                  <td>{formatSek(invoice.netMinor, locale)}</td>
                  <td>{t(invoice.status)}</td>
                  <td>
                    {invoice.status === "issued" && (
                      <form
                        className="finance-inline-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void post(
                            {
                              action: "markInvoicePaid",
                              invoiceId: invoice.id,
                              paidDate: form.get("paidDate"),
                              categoryId: form.get("categoryId"),
                            },
                            "invoicePaid",
                          );
                        }}
                      >
                        <input
                          className="field"
                          type="date"
                          name="paidDate"
                          defaultValue={today()}
                          required
                        />
                        <select className="field" name="categoryId" required>
                          <option value="">{t("category")}</option>
                          {data.categories
                            .filter(
                              (category) => category.direction === "income",
                            )
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {categoryName(category.id)}
                              </option>
                            ))}
                        </select>
                        <button className="table-action" disabled={busy}>
                          {t("markPaid")}
                        </button>
                      </form>
                    )}
                    {invoice.status !== "void" && (
                      <button
                        className="table-action table-action-danger"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(t("confirmVoidInvoice"))) return;
                          void post(
                            {
                              action: "voidInvoice",
                              invoiceId: invoice.id,
                              reason: t("financeCorrectionReason"),
                            },
                            "invoiceVoided",
                          );
                        }}
                      >
                        {t("void")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card table-wrap">
        <h2>{t("transactions")}</h2>
        <table>
          <thead>
            <tr>
              <th>{t("date")}</th>
              <th>{t("type")}</th>
              <th>{t("category")}</th>
              {manager && <th>{t("consultant")}</th>}
              <th>{t("description")}</th>
              <th>{t("netAmount")}</th>
              <th>{t("balanceChange")}</th>
              {manager && (
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.date}</td>
                <td>{t(transaction.direction)}</td>
                <td>{categoryName(transaction.categoryId)}</td>
                {manager && <td>{consultantName(transaction.consultantId)}</td>}
                <td>{transaction.visibleDescription || "—"}</td>
                <td>{formatSek(transaction.netMinor, locale)}</td>
                <td>
                  {formatSek(transaction.consultantBalanceDeltaMinor, locale)}
                </td>
                {manager && (
                  <td>
                    {!transaction.invoiceId &&
                      !transaction.reversedByTransactionId &&
                      transaction.status !== "reversal" && (
                        <button
                          className="table-action table-action-danger"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(t("confirmVoidTransaction")))
                              return;
                            void post(
                              {
                                action: "voidTransaction",
                                transactionId: transaction.id,
                                reason: t("financeCorrectionReason"),
                              },
                              "transactionVoided",
                            );
                          }}
                        >
                          {t("void")}
                        </button>
                      )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
