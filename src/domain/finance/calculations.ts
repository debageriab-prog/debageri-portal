import type { FinancialTransaction } from "@/domain/types";

export function calculateVatMinor(netMinor: number, vatRateBps: number) {
  return Math.round((netMinor * vatRateBps) / 10_000);
}

export function calculateTransactionAmounts(
  amountMode: "net" | "gross",
  amountMinor: number,
  vatRateBps: number,
) {
  if (amountMode === "gross") {
    const netMinor = Math.round((amountMinor * 10_000) / (10_000 + vatRateBps));
    return {
      netMinor,
      vatMinor: amountMinor - netMinor,
      grossMinor: amountMinor,
    };
  }
  const vatMinor = calculateVatMinor(amountMinor, vatRateBps);
  return {
    netMinor: amountMinor,
    vatMinor,
    grossMinor: amountMinor + vatMinor,
  };
}

export function calculateShareMinor(netMinor: number, shareBps: number) {
  return Math.round((netMinor * shareBps) / 10_000);
}

type TransactionScopeInput = Pick<
  FinancialTransaction,
  | "consultantId"
  | "direction"
  | "funding"
  | "netMinor"
  | "consultantBalanceDeltaMinor"
>;

export function belongsToCompany(transaction: TransactionScopeInput) {
  return (
    transaction.consultantId === null ||
    (transaction.direction === "expense" && transaction.funding === "company")
  );
}

export function companyBalanceDeltaMinor(transaction: TransactionScopeInput) {
  if (transaction.consultantId === null)
    return transaction.consultantBalanceDeltaMinor;
  if (transaction.direction === "expense" && transaction.funding === "company")
    return -transaction.netMinor;
  return 0;
}

export function belongsToFixedConsultantResult(
  transaction: Pick<
    FinancialTransaction,
    "consultantId" | "direction" | "invoiceId"
  >,
  consultantId: string,
  invoiceConsultantId: string | null,
) {
  return (
    transaction.consultantId === consultantId ||
    (transaction.consultantId === null &&
      transaction.direction === "income" &&
      transaction.invoiceId !== null &&
      invoiceConsultantId === consultantId)
  );
}

export function transactionTableDescription(
  transaction: Pick<
    FinancialTransaction,
    | "consultantId"
    | "direction"
    | "funding"
    | "visibleDescription"
    | "internalNote"
  >,
) {
  if (transaction.visibleDescription) return transaction.visibleDescription;
  if (
    transaction.consultantId === null &&
    transaction.direction === "expense" &&
    transaction.funding === "company"
  )
    return transaction.internalNote;
  return "";
}

export function allocateInvoiceIncome(
  netMinor: number,
  compensationModel: "flexible" | "fixed" | null,
  shareBps: number,
) {
  const consultantMinor =
    compensationModel === "flexible"
      ? calculateShareMinor(netMinor, shareBps)
      : 0;
  return {
    consultantMinor,
    companyMinor: netMinor - consultantMinor,
  };
}

export function financeTotals(
  transactions: Array<
    Pick<
      FinancialTransaction,
      "direction" | "netMinor" | "vatMinor" | "consultantBalanceDeltaMinor"
    >
  >,
) {
  return transactions.reduce(
    (totals, transaction) => {
      const sign = transaction.direction === "income" ? 1 : -1;
      if (transaction.direction === "income") {
        totals.incomeMinor += transaction.netMinor;
        totals.outputVatMinor += transaction.vatMinor;
      } else {
        totals.expenseMinor += transaction.netMinor;
        totals.inputVatMinor += transaction.vatMinor;
      }
      totals.balanceMinor += transaction.consultantBalanceDeltaMinor;
      totals.netResultMinor += transaction.netMinor * sign;
      return totals;
    },
    {
      incomeMinor: 0,
      expenseMinor: 0,
      outputVatMinor: 0,
      inputVatMinor: 0,
      balanceMinor: 0,
      netResultMinor: 0,
    },
  );
}

export function expenseTotalsByCategory(
  transactions: Array<
    Pick<FinancialTransaction, "categoryId" | "direction" | "netMinor">
  >,
) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.direction !== "expense") continue;
    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) ?? 0) + transaction.netMinor,
    );
  }
  return [...totals.entries()]
    .map(([categoryId, amountMinor]) => ({ categoryId, amountMinor }))
    .filter((item) => item.amountMinor > 0)
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.categoryId.localeCompare(right.categoryId),
    );
}

export function formatSek(minor: number, locale: "sv-SE" | "en-SE") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export function parseSek(value: string | number) {
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("Invalid SEK amount");
  return Math.round(amount * 100);
}
