import type { FinancialTransaction } from "@/domain/types";

export function calculateVatMinor(netMinor: number, vatRateBps: number) {
  return Math.round((netMinor * vatRateBps) / 10_000);
}

export function calculateShareMinor(netMinor: number, shareBps: number) {
  return Math.round((netMinor * shareBps) / 10_000);
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
