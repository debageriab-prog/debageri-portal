import {
  exportPeriodBounds,
  type ExportPeriod,
} from "@/domain/reports/time-report-export";
import {
  isSalaryRelatedExpenseCode,
  SALARY_RELATED_EXPENSE_CODES,
} from "./calculations";

/**
 * One consultant's income and expenses per month, laid out like their
 * compensation sheet: income first, then expenses other than salary, then
 * salary and what comes with it, and what is left. Every amount is what
 * moved the consultant's balance, so the closing balance always equals the
 * opening balance plus the result.
 */

export type ReportTransaction = {
  direction: "income" | "expense";
  categoryId: string;
  invoiceId: string | null;
  date: string;
  consultantBalanceDeltaMinor: number;
};

export type ReportInvoice = {
  status: "issued" | "paid" | "void";
  issueDate: string;
  periodFrom?: string | null;
  paidDate: string | null;
  netMinor: number;
  shareBps: number;
};

export type ReportWorkedEntry = {
  date: string;
  minutes: number;
  /** SEK per hour, as on the time code. */
  hourlyRate: number;
};

export type ReportCategory = {
  id: string;
  code: string;
  name: { en: string; sv: string };
};

export type FinanceReportLabels = {
  openingBalance: string;
  workedHours: string;
  hourlyRate: string;
  invoiced: string;
  paidInvoices: string;
  share: string;
  totalIncome: string;
  totalExpenses: string;
  result: string;
  closingBalance: string;
};

export type ReportUnit = "money" | "hours" | "rate";

export type ReportRowStyle =
  | "balance"
  | "info"
  | "share"
  | "income"
  | "expense"
  | "subtotal"
  | "totalExpenses"
  | "result";

export type ReportRow =
  | { kind: "separator"; tone: "income" | "expenses" }
  | {
      kind: "values";
      label: string;
      style: ReportRowStyle;
      unit: ReportUnit;
      /** One per month; öre for money, hours, or SEK per hour. */
      values: Array<number | null>;
      /** The whole-period value shown in the Total column of a year. */
      total: number | null;
    };

export type FinanceReport = {
  months: number[];
  /** Set for a year, where a Total column comes before the months. */
  showTotal: boolean;
  rows: ReportRow[];
};

const pad = (value: number) => String(value).padStart(2, "0");

const monthOf = (date: string | null | undefined) =>
  date ? Number(date.slice(5, 7)) : 0;

export function buildFinanceReport({
  period,
  categories,
  transactions,
  invoices,
  workedEntries,
  language,
  labels,
}: {
  period: ExportPeriod;
  categories: readonly ReportCategory[];
  transactions: readonly ReportTransaction[];
  invoices: readonly ReportInvoice[];
  workedEntries: readonly ReportWorkedEntry[];
  language: "en" | "sv";
  labels: FinanceReportLabels;
}): FinanceReport {
  const [start, end] = exportPeriodBounds(period);
  const months = period.month
    ? [period.month]
    : Array.from({ length: 12 }, (_, index) => index + 1);
  const inPeriod = (date: string | null | undefined) =>
    !!date && date >= start && date <= end;
  const perMonth = <T>(
    items: readonly T[],
    date: (item: T) => string | null | undefined,
    amount: (item: T) => number,
  ) =>
    months.map((month) =>
      items
        .filter((item) => inPeriod(date(item)) && monthOf(date(item)) === month)
        .reduce((sum, item) => sum + amount(item), 0),
    );
  const sum = (values: ReadonlyArray<number | null>) =>
    values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const row = (
    label: string,
    style: ReportRowStyle,
    values: Array<number | null>,
    unit: ReportUnit = "money",
    total: number | null = sum(values),
  ): ReportRow => ({ kind: "values", label, style, unit, values, total });

  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const categoryLabel = (id: string) => {
    const category = categoryById.get(id);
    return category?.name[language] || category?.code || id;
  };
  const categoryCode = (id: string) => categoryById.get(id)?.code ?? "";

  // Balance before each month, from every movement before it.
  const balanceBefore = (date: string) =>
    transactions
      .filter((transaction) => transaction.date < date)
      .reduce(
        (total, transaction) => total + transaction.consultantBalanceDeltaMinor,
        0,
      );
  const opening = months.map((month) =>
    balanceBefore(`${period.year}-${pad(month)}-01`),
  );

  // What was worked and at which rate, from the time report.
  const workedMinutes = perMonth(
    workedEntries,
    (entry) => entry.date,
    (entry) => entry.minutes,
  );
  const workedValue = perMonth(
    workedEntries,
    (entry) => entry.date,
    (entry) => entry.minutes * entry.hourlyRate,
  );
  const hours = workedMinutes.map((minutes) => (minutes ? minutes / 60 : null));
  const rate = workedMinutes.map((minutes, index) =>
    minutes ? Math.round((workedValue[index]! / minutes) * 100) / 100 : null,
  );
  const totalWorked = sum(workedMinutes);

  const billable = invoices.filter((invoice) => invoice.status !== "void");
  const invoiced = perMonth(
    billable,
    (invoice) => invoice.periodFrom || invoice.issueDate,
    (invoice) => invoice.netMinor,
  );
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const paidInvoices = perMonth(
    paid,
    (invoice) => invoice.paidDate,
    (invoice) => invoice.netMinor,
  );
  const shares = [
    ...new Set(
      paid
        .filter((invoice) => inPeriod(invoice.paidDate))
        .map((invoice) => invoice.shareBps),
    ),
  ];
  const shareLabel =
    shares.length === 1 && shares[0]! > 0
      ? `${labels.share} (${shares[0]! / 100}%)`
      : labels.share;

  const income = transactions.filter(
    (transaction) => transaction.direction === "income",
  );
  const share = perMonth(
    income.filter((transaction) => transaction.invoiceId !== null),
    (transaction) => transaction.date,
    (transaction) => transaction.consultantBalanceDeltaMinor,
  );

  /** One row per category with any amount in the period, by name. */
  const categoryRows = (
    rows: readonly ReportTransaction[],
    style: ReportRowStyle,
    sign: 1 | -1,
    order: (left: string, right: string) => number,
  ) =>
    [...new Set(rows.map((transaction) => transaction.categoryId))]
      .map((categoryId) => ({
        categoryId,
        values: perMonth(
          rows.filter((transaction) => transaction.categoryId === categoryId),
          (transaction) => transaction.date,
          (transaction) => sign * transaction.consultantBalanceDeltaMinor,
        ),
      }))
      .filter(({ values }) => values.some((value) => value !== 0))
      .sort((left, right) => order(left.categoryId, right.categoryId))
      .map(({ categoryId, values }) =>
        row(categoryLabel(categoryId), style, values),
      );
  const byName = (left: string, right: string) =>
    categoryLabel(left).localeCompare(categoryLabel(right));
  const salaryOrder = (id: string) => {
    const index = (SALARY_RELATED_EXPENSE_CODES as readonly string[]).indexOf(
      categoryCode(id).trim().toLowerCase(),
    );
    return index < 0 ? SALARY_RELATED_EXPENSE_CODES.length : index;
  };

  const otherIncomeRows = categoryRows(
    income.filter((transaction) => transaction.invoiceId === null),
    "income",
    1,
    byName,
  );
  const expenses = transactions.filter(
    (transaction) => transaction.direction === "expense",
  );
  const salaryRelated = (transaction: ReportTransaction) =>
    isSalaryRelatedExpenseCode(categoryCode(transaction.categoryId));
  const expenseRows = categoryRows(
    expenses.filter((transaction) => !salaryRelated(transaction)),
    "expense",
    -1,
    byName,
  );
  const salaryRows = categoryRows(
    expenses.filter(salaryRelated),
    "expense",
    -1,
    (left, right) =>
      salaryOrder(left) - salaryOrder(right) || byName(left, right),
  );

  const columnSums = (rows: ReportRow[]) =>
    months.map((_, index) =>
      rows.reduce(
        (total, item) =>
          total + (item.kind === "values" ? (item.values[index] ?? 0) : 0),
        0,
      ),
    );
  const totalIncome = months.map(
    (_, index) => share[index]! + columnSums(otherIncomeRows)[index]!,
  );
  const totalExpenses = columnSums([...expenseRows, ...salaryRows]);
  const result = months.map(
    (_, index) => totalIncome[index]! - totalExpenses[index]!,
  );
  const closing = months.map((month) =>
    balanceBefore(
      month === 12
        ? `${period.year + 1}-01-01`
        : `${period.year}-${pad(month + 1)}-01`,
    ),
  );

  return {
    months,
    showTotal: !period.month,
    rows: [
      row(labels.openingBalance, "balance", opening, "money", opening[0]!),
      row(
        labels.workedHours,
        "info",
        hours,
        "hours",
        totalWorked ? totalWorked / 60 : null,
      ),
      row(
        labels.hourlyRate,
        "info",
        rate,
        "rate",
        totalWorked
          ? Math.round((sum(workedValue) / totalWorked) * 100) / 100
          : null,
      ),
      row(labels.invoiced, "info", invoiced),
      row(labels.paidInvoices, "info", paidInvoices),
      row(shareLabel, "share", share),
      ...otherIncomeRows,
      ...(otherIncomeRows.length
        ? [row(labels.totalIncome, "subtotal", totalIncome)]
        : []),
      { kind: "separator", tone: "income" },
      ...expenseRows,
      { kind: "separator", tone: "expenses" },
      ...salaryRows,
      row(labels.totalExpenses, "totalExpenses", totalExpenses),
      row(labels.result, "result", result),
      row(
        labels.closingBalance,
        "balance",
        closing,
        "money",
        closing[closing.length - 1]!,
      ),
    ],
  };
}

/** FinanceReport_ConsultantName_Year_Month, or without the month for a year. */
export function financeReportFileName(
  displayName: string,
  period: ExportPeriod,
  format: "xlsx" | "pdf",
) {
  const name =
    displayName.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "") ||
    "Consultant";
  return `FinanceReport_${name}_${period.year}${period.month ? `_${pad(period.month)}` : ""}.${format}`;
}
