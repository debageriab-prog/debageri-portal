"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { financeTotals, formatSek } from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";

export interface FinancePageData {
  financeEnabled: boolean;
  users: Array<{
    id: string;
    displayName: string;
    employeeNumber: string;
    role: string;
    compensationModel: "flexible" | "fixed" | null;
  }>;
  customers: Array<{
    id: string;
    name: string;
    contactPerson: string;
    financeEmail: string;
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
    internalNote: string;
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
type FinanceSection =
  | "overview"
  | "compensation"
  | "invoices"
  | "categories"
  | "transactions"
  | "customers";
function today() {
  return new Date().toISOString().slice(0, 10);
}

function BalanceChart({
  transactions,
  locale,
  period,
  anchor,
  mode,
  categoryName,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
  mode: "balance" | "result";
  categoryName: (id: string) => string;
}) {
  const { t } = useLocale();
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const prefix = period === "month" ? anchor : anchor.slice(0, 4);
  const sorted = [...transactions]
    .filter((transaction) =>
      period === "all" ? true : transaction.date.startsWith(prefix),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInYear =
    new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
  const dayOfYear = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    return (
      Math.floor(
        (value.getTime() - Date.UTC(value.getUTCFullYear(), 0, 1)) / 86_400_000,
      ) + 1
    );
  };
  const transactionPoints = sorted.reduce<
    Array<{
      transaction: FinancePageData["transactions"][number];
      change: number;
      balance: number;
      xRatio: number;
    }>
  >((points, transaction, index) => {
    const change =
      mode === "balance"
        ? transaction.consultantBalanceDeltaMinor
        : transaction.direction === "income"
          ? transaction.netMinor
          : -transaction.netMinor;
    const balance = (points.at(-1)?.balance ?? 0) + change;
    const xRatio =
      period === "month"
        ? Number(transaction.date.slice(8, 10)) / daysInMonth
        : period === "year"
          ? dayOfYear(transaction.date) / daysInYear
          : (index + 1) / Math.max(1, sorted.length);
    return [...points, { transaction, change, balance, xRatio }];
  }, []);
  const chartPoints = [
    { xRatio: 0, balance: 0, change: 0, transaction: null },
    ...transactionPoints,
  ];
  const values = chartPoints.map((point) => point.balance);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const rawRange = max - min;
  const padding = rawRange === 0 ? 10_000 : rawRange * 0.12;
  min = min < 0 ? min - padding : 0;
  max = max > 0 ? max + padding : 0;
  if (min === max) max = padding;
  const range = max - min;
  const plot = { left: 88, right: 975, top: 20, bottom: 308 };
  const x = (ratio: number) => plot.left + ratio * (plot.right - plot.left);
  const y = (value: number) =>
    plot.bottom - ((value - min) / range) * (plot.bottom - plot.top);
  const polyline = chartPoints
    .map((point) => `${x(point.xRatio)},${y(point.balance)}`)
    .join(" ");
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => min + (range * index) / 4,
  );
  const xTicks =
    period === "month"
      ? [0, 5, 10, 15, 20, 25, daysInMonth]
          .filter(
            (value, index, values) =>
              value <= daysInMonth && values.indexOf(value) === index,
          )
          .map((value) => ({
            ratio: value / daysInMonth,
            label: String(value),
          }))
      : period === "year"
        ? [0, 2, 4, 6, 8, 10, 12].map((value) => ({
            ratio: value / 12,
            label: String(value),
          }))
        : [
            { ratio: 0, label: "0" },
            ...(sorted.length
              ? [{ ratio: 1, label: sorted.at(-1)?.date ?? "" }]
              : []),
          ];
  const axisSek = (minor: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  const hovered = hoveredPoint === null ? null : chartPoints[hoveredPoint];
  return (
    <div className="finance-chart">
      <div className="finance-chart-canvas">
        <svg viewBox="0 0 1000 360" role="img" aria-label={t("balanceHistory")}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="finance-chart-gridline"
                x1={plot.left}
                x2={plot.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="finance-chart-axis-label"
                x={plot.left - 12}
                y={y(tick) + 4}
                textAnchor="end"
              >
                {axisSek(tick)}
              </text>
            </g>
          ))}
          <line
            className="finance-chart-axis"
            x1={plot.left}
            x2={plot.left}
            y1={plot.top}
            y2={plot.bottom}
          />
          <line
            className="finance-chart-zero"
            x1={plot.left}
            x2={plot.right}
            y1={y(0)}
            y2={y(0)}
          />
          {xTicks.map((tick) => (
            <g key={`${tick.ratio}-${tick.label}`}>
              <line
                className="finance-chart-axis"
                x1={x(tick.ratio)}
                x2={x(tick.ratio)}
                y1={plot.bottom}
                y2={plot.bottom + 6}
              />
              <text
                className="finance-chart-axis-label"
                x={x(tick.ratio)}
                y={plot.bottom + 24}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}
          <text className="finance-chart-axis-title" x={18} y={18}>
            SEK
          </text>
          <text
            className="finance-chart-axis-title"
            x={plot.right}
            y={352}
            textAnchor="end"
          >
            {period === "month"
              ? t("chartDay")
              : period === "year"
                ? t("month")
                : t("date")}
          </text>
          <polyline
            className="finance-chart-line"
            points={polyline}
            fill="none"
          />
          {chartPoints.map((point, index) => (
            <circle
              className="finance-chart-point"
              key={point.transaction?.id ?? "origin"}
              cx={x(point.xRatio)}
              cy={y(point.balance)}
              r={index === 0 ? 5 : 7}
              tabIndex={0}
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(index)}
              onBlur={() => setHoveredPoint(null)}
            />
          ))}
        </svg>
        {hovered && (
          <div
            className="finance-chart-tooltip"
            style={{
              left: `clamp(120px, ${(x(hovered.xRatio) / 1000) * 100}%, calc(100% - 120px))`,
              top: `${(y(hovered.balance) / 360) * 100}%`,
              transform:
                y(hovered.balance) < 125
                  ? "translate(-50%, 12px)"
                  : "translate(-50%, calc(-100% - 12px))",
            }}
          >
            {hovered.transaction ? (
              <>
                <strong>{categoryName(hovered.transaction.categoryId)}</strong>
                <span>
                  {hovered.transaction.date} ·{" "}
                  {t(hovered.transaction.direction)}
                </span>
                {(hovered.transaction.internalNote ||
                  hovered.transaction.visibleDescription) && (
                  <span>
                    {t("description")}:{" "}
                    {hovered.transaction.internalNote ||
                      hovered.transaction.visibleDescription}
                  </span>
                )}
                <span>
                  {t("balanceChange")}: {formatSek(hovered.change, locale)}
                </span>
                <span>
                  {t("remainingBalance")}: {formatSek(hovered.balance, locale)}
                </span>
              </>
            ) : (
              <>
                <strong>{t("chartStartingPoint")}</strong>
                <span>{formatSek(0, locale)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FinanceDashboard({
  data,
  actor,
  section,
}: {
  data: FinancePageData;
  actor: Actor;
  section: FinanceSection;
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
  const [invoiceConsultantFilter, setInvoiceConsultantFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [endingAgreement, setEndingAgreement] = useState<
    FinancePageData["agreements"][number] | null
  >(null);
  const [reversingTransaction, setReversingTransaction] = useState<
    FinancePageData["transactions"][number] | null
  >(null);
  const categoryName = (id: string) => {
    const item = data.categories.find((category) => category.id === id);
    return item ? item.name[locale === "sv-SE" ? "sv" : "en"] : "—";
  };
  const consultantName = (id: string | null) =>
    id
      ? (data.users.find((user) => user.id === id)?.displayName ?? "—")
      : t("companyOnly");
  const visibleTransactions = useMemo(
    () =>
      selectedConsultant === "all"
        ? data.transactions
        : selectedConsultant === "company"
          ? data.transactions.filter((item) => item.consultantId === null)
          : data.transactions.filter(
              (item) => item.consultantId === selectedConsultant,
            ),
    [data.transactions, selectedConsultant],
  );
  const totals = financeTotals(visibleTransactions);
  const earnedShare = visibleTransactions.reduce(
    (sum, item) => sum + Math.max(0, item.consultantBalanceDeltaMinor),
    0,
  );
  const spentFromBalance = visibleTransactions.reduce(
    (sum, item) => sum + Math.max(0, -item.consultantBalanceDeltaMinor),
    0,
  );
  const consultantLiability = manager
    ? data.users
        .filter((user) => user.compensationModel === "flexible")
        .reduce(
          (sum, user) =>
            sum +
            Math.max(
              0,
              data.transactions
                .filter((item) => item.consultantId === user.id)
                .reduce(
                  (value, item) => value + item.consultantBalanceDeltaMinor,
                  0,
                ),
            ),
          0,
        )
    : totals.balanceMinor;
  const outstandingInvoices = data.invoices
    .filter(
      (invoice) =>
        invoice.status === "issued" &&
        (selectedConsultant === "all" ||
          (selectedConsultant === "company" && invoice.consultantId === null) ||
          invoice.consultantId === selectedConsultant),
    )
    .reduce((sum, invoice) => sum + invoice.grossMinor, 0);
  const filteredInvoices = data.invoices.filter(
    (invoice) =>
      (invoiceConsultantFilter === "all" ||
        (invoiceConsultantFilter === "company" &&
          invoice.consultantId === null) ||
        invoice.consultantId === invoiceConsultantFilter) &&
      (invoiceStatusFilter === "all" || invoice.status === invoiceStatusFilter),
  );
  const selectedModel = data.users.find(
    (user) => user.id === selectedConsultant,
  )?.compensationModel;
  const chartMode =
    !manager || selectedModel === "flexible" ? "balance" : "result";

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
        setError(
          t(
            `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
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

  const title = {
    overview: manager ? t("financialOverview") : t("myFinances"),
    compensation: t("compensationManagement"),
    invoices: t("invoiceManagement"),
    categories: t("categoryManagement"),
    transactions: t("incomeExpenseManagement"),
    customers: t("customerManagement"),
  }[section];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{title}</h1>
          <p className="muted page-description">
            {section === "overview"
              ? manager
                ? t("financeManagementDescription")
                : t("consultantFinanceDescription")
              : t(`${section}SectionDescription` as Parameters<typeof t>[0])}
          </p>
        </div>
        {manager && section === "overview" && (
          <label>
            {t("consultant")}
            <select
              className="field"
              value={selectedConsultant}
              onChange={(event) => setSelectedConsultant(event.target.value)}
            >
              <option value="all">{t("allConsultantsAndCompany")}</option>
              <option value="company">{t("companyOnly")}</option>
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

      {section === "overview" && (
        <>
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
              <>
                <div className="metric">
                  <span>{t("vatPayable")}</span>
                  <strong>
                    {formatSek(
                      totals.outputVatMinor - totals.inputVatMinor,
                      locale,
                    )}
                  </strong>
                </div>
                <div className="metric">
                  <span>{t("retainedResult")}</span>
                  <strong>
                    {formatSek(
                      totals.netResultMinor -
                        (selectedConsultant === "all"
                          ? consultantLiability
                          : 0),
                      locale,
                    )}
                  </strong>
                </div>
                <div className="metric">
                  <span>{t("outstandingInvoices")}</span>
                  <strong>{formatSek(outstandingInvoices, locale)}</strong>
                </div>
              </>
            )}
          </section>
          <section className="card finance-chart-card">
            <div className="week-head">
              <h2>
                {chartMode === "balance"
                  ? t("balanceHistory")
                  : t("financialHistory")}
              </h2>
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
              {chartPeriod === "month" && (
                <input
                  className="field finance-period"
                  type="month"
                  aria-label={t("chartPeriod")}
                  value={chartAnchor}
                  onChange={(event) => setChartAnchor(event.target.value)}
                />
              )}
              {chartPeriod === "year" && (
                <input
                  className="field finance-period"
                  type="number"
                  min="2000"
                  max="2100"
                  aria-label={t("chartPeriod")}
                  value={chartAnchor.slice(0, 4)}
                  onChange={(event) =>
                    setChartAnchor(`${event.target.value}-01`)
                  }
                />
              )}
            </div>
            <BalanceChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
              mode={chartMode}
              categoryName={categoryName}
            />
          </section>
        </>
      )}

      {manager && section === "compensation" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCompensation")}</h2>
            {admin && (
              <Link className="button" href="/finance/compensation/new">
                {t("addCompensation")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("consultant")}</th>
                <th>{t("compensationModel")}</th>
                <th>{t("validFrom")}</th>
                <th>{t("validTo")}</th>
                <th>{t("compensationTerms")}</th>
                {admin && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td>{consultantName(agreement.userId)}</td>
                  <td>
                    {t(
                      agreement.model === "flexible"
                        ? "flexible"
                        : "fixedSalary",
                    )}
                  </td>
                  <td>{agreement.validFrom}</td>
                  <td>{agreement.validTo ?? "—"}</td>
                  <td>
                    {agreement.model === "flexible"
                      ? `${t("invoiceSharePercent")}: ${agreement.shareBps / 100}%`
                      : agreement.fixedMonthlySalaryMinor !== null
                        ? `${t("monthlySalary")}: ${formatSek(agreement.fixedMonthlySalaryMinor, locale)}`
                        : "—"}
                  </td>
                  {admin && (
                    <td>
                      {agreement.validTo === null && (
                        <button
                          className="table-action"
                          onClick={() => setEndingAgreement(agreement)}
                        >
                          {t("setValidTo")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {manager && section === "customers" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCustomers")}</h2>
            <Link className="button" href="/finance/customers/new">
              {t("addCustomer")}
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("customerName")}</th>
                <th>{t("contactPerson")}</th>
                <th>{t("financeDepartmentEmail")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.contactPerson}</td>
                  <td>{customer.financeEmail}</td>
                  <td>
                    <Link
                      className="table-action"
                      href={`/finance/customers/${customer.id}/edit`}
                    >
                      {t("edit")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {manager && section === "categories" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCategories")}</h2>
            {admin && (
              <Link className="button" href="/finance/categories/new">
                {t("addCategory")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("code")}</th>
                <th>{t("englishName")}</th>
                <th>{t("swedishName")}</th>
                <th>{t("type")}</th>
                <th>{t("status")}</th>
                {admin && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.code}</td>
                  <td>{category.name.en}</td>
                  <td>{category.name.sv}</td>
                  <td>{t(category.direction)}</td>
                  <td>{t(category.active ? "active" : "inactive")}</td>
                  {admin && (
                    <td>
                      <Link
                        className="table-action"
                        href={`/finance/categories/${category.id}/edit`}
                      >
                        {t("edit")}
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {manager && section === "invoices" && (
        <>
          <section className="card">
            <div className="week-head">
              <h2>{t("invoices")}</h2>
              <div className="actions">
                <Link
                  className="button secondary"
                  href="/finance/invoices/import"
                >
                  {t("csvImport")}
                </Link>
                <Link className="button" href="/finance/invoices/new">
                  {t("addInvoice")}
                </Link>
              </div>
            </div>
            <div className="finance-filter-bar">
              <label>
                {t("consultant")}
                <select
                  className="field"
                  value={invoiceConsultantFilter}
                  onChange={(event) =>
                    setInvoiceConsultantFilter(event.target.value)
                  }
                >
                  <option value="all">{t("allConsultantsAndCompany")}</option>
                  <option value="company">{t("companyOnly")}</option>
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("paymentStatus")}
                <select
                  className="field"
                  value={invoiceStatusFilter}
                  onChange={(event) =>
                    setInvoiceStatusFilter(event.target.value)
                  }
                >
                  <option value="all">{t("allStatuses")}</option>
                  <option value="issued">{t("issued")}</option>
                  <option value="paid">{t("paid")}</option>
                </select>
              </label>
            </div>
          </section>
          <section className="card table-wrap">
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
                {filteredInvoices.map((invoice) => (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {manager && section === "transactions" && (
        <div className="actions finance-page-actions">
          <Link
            className="button secondary"
            href="/finance/transactions/import"
          >
            {t("csvImport")}
          </Link>
          <Link className="button" href="/finance/transactions/new">
            {t("addTransaction")}
          </Link>
        </div>
      )}
      {((manager && section === "transactions") ||
        (!manager && section === "overview")) && (
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
                  {manager && (
                    <td>{consultantName(transaction.consultantId)}</td>
                  )}
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
                            onClick={() => setReversingTransaction(transaction)}
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
      )}

      {endingAgreement && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void post(
                {
                  action: "setCompensationValidTo",
                  agreementId: endingAgreement.id,
                  validTo: form.get("validTo"),
                },
                "validToSaved",
              ).then((ok) => {
                if (ok) setEndingAgreement(null);
              });
            }}
          >
            <header className="modal-header">
              <div>
                <h2>{t("setValidToTitle")}</h2>
                <p>{t("setValidToExplanation")}</p>
              </div>
            </header>
            <label>
              {t("validTo")}
              <input
                className="field"
                type="date"
                name="validTo"
                min={endingAgreement.validFrom}
                defaultValue={today()}
                required
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEndingAgreement(null)}
              >
                {t("cancel")}
              </button>
              <button className="button" disabled={busy}>
                {t("confirmSetValidTo")}
              </button>
            </footer>
          </form>
        </div>
      )}
      {reversingTransaction && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <h2>{t("reverseTransactionTitle")}</h2>
                <p>{t("reverseTransactionExplanation")}</p>
              </div>
            </header>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setReversingTransaction(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void post(
                    {
                      action: "voidTransaction",
                      transactionId: reversingTransaction.id,
                      reason: t("financeCorrectionReason"),
                    },
                    "transactionVoided",
                  ).then((ok) => {
                    if (ok) setReversingTransaction(null);
                  })
                }
              >
                {t("confirmReverse")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
