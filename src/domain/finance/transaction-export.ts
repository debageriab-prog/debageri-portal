import { transactionExportCsvHeaders, type CsvRow } from "./csv";

/**
 * What the Income and expenses exports share: the backup CSV that can
 * recreate every payment, the running balance shown next to each row, the
 * totals of a view, and the fingerprint the backup import uses to recognise
 * payments that are already in the portal.
 */

/**
 * The backup carries the stored VAT, rounding and total as well, so a
 * restored payment has exactly the amounts it had, not recalculated ones.
 * They are optional on import, so older exports stay importable.
 */
export const transactionBackupCsvHeaders = [
  ...transactionExportCsvHeaders,
  "vat_sek",
  "rounding_sek",
  "gross_sek",
] as const;

export type ExportableTransaction = {
  id: string;
  direction: "income" | "expense";
  categoryId: string;
  consultantId: string | null;
  date: string;
  netMinor: number;
  vatRateBps: number;
  vatMinor: number;
  roundingMinor: number;
  grossMinor: number;
  funding: "company" | "consultant" | null;
  applyConsultantShare: boolean;
  shareBpsOverride: number | null;
  visibleDescription: string;
  internalNote: string;
  createdAt: number;
};

/** Öre as kronor with two decimals and a dot, e.g. `-1234.50`. */
export function sekValue(minor: number) {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Basis points as a percentage with two decimals, e.g. `25.00`. */
export function percentValue(bps: number) {
  return sekValue(bps);
}

export function transactionBackupRows(
  transactions: readonly ExportableTransaction[],
  lookup: {
    employeeNumber: (userId: string) => string;
    categoryCode: (categoryId: string) => string;
  },
): CsvRow[] {
  return transactions.map((transaction) => ({
    direction: transaction.direction,
    import_key: transaction.id,
    consultant_employee_number: transaction.consultantId
      ? lookup.employeeNumber(transaction.consultantId)
      : "",
    date: transaction.date,
    category_code: lookup.categoryCode(transaction.categoryId),
    net_sek: sekValue(transaction.netMinor),
    vat_percent: percentValue(transaction.vatRateBps),
    funding: transaction.funding ?? "",
    apply_share: transaction.applyConsultantShare ? "true" : "false",
    description: transaction.visibleDescription,
    internal_note: transaction.internalNote,
    share_percent:
      transaction.shareBpsOverride === null
        ? ""
        : percentValue(transaction.shareBpsOverride),
    vat_sek: sekValue(transaction.vatMinor),
    rounding_sek: sekValue(transaction.roundingMinor),
    gross_sek: sekValue(transaction.grossMinor),
  }));
}

/**
 * The balance after each transaction, oldest first, by date and then by when
 * it was recorded. Pass every transaction of the scope, not only the visible
 * ones, so a filtered view still shows the real balance at each row.
 */
export function balancesAfter<
  T extends { id: string; date: string; createdAt: number },
>(transactions: readonly T[], change: (transaction: T) => number) {
  const ordered = [...transactions].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.createdAt - right.createdAt,
  );
  const balances = new Map<string, number>();
  let balance = 0;
  for (const transaction of ordered) {
    balance += change(transaction);
    balances.set(transaction.id, balance);
  }
  return balances;
}

export type TransactionExportTotals = {
  count: number;
  incomeNetMinor: number;
  incomeVatMinor: number;
  incomeGrossMinor: number;
  expenseNetMinor: number;
  expenseVatMinor: number;
  expenseGrossMinor: number;
  /** Income minus expenses, excluding VAT. */
  resultNetMinor: number;
  /** VAT on income minus VAT on expenses. */
  vatNetMinor: number;
  balanceChangeMinor: number;
};

export function transactionExportTotals<T extends ExportableTransaction>(
  transactions: readonly T[],
  change: (transaction: T) => number,
): TransactionExportTotals {
  const totals: TransactionExportTotals = {
    count: transactions.length,
    incomeNetMinor: 0,
    incomeVatMinor: 0,
    incomeGrossMinor: 0,
    expenseNetMinor: 0,
    expenseVatMinor: 0,
    expenseGrossMinor: 0,
    resultNetMinor: 0,
    vatNetMinor: 0,
    balanceChangeMinor: 0,
  };
  for (const transaction of transactions) {
    // VAT is what is left of the total after the net amount and rounding.
    const vat = transaction.grossMinor - transaction.netMinor;
    if (transaction.direction === "income") {
      totals.incomeNetMinor += transaction.netMinor;
      totals.incomeVatMinor += vat;
      totals.incomeGrossMinor += transaction.grossMinor;
    } else {
      totals.expenseNetMinor += transaction.netMinor;
      totals.expenseVatMinor += vat;
      totals.expenseGrossMinor += transaction.grossMinor;
    }
    totals.balanceChangeMinor += change(transaction);
  }
  totals.resultNetMinor = totals.incomeNetMinor - totals.expenseNetMinor;
  totals.vatNetMinor = totals.incomeVatMinor - totals.expenseVatMinor;
  return totals;
}

/**
 * What makes two payments the same when their import keys differ: the same
 * kind, day, category, consultant, amounts and description.
 */
export function transactionFingerprint(transaction: {
  direction: string;
  date: string;
  categoryId: string;
  consultantId: string | null;
  netMinor: number;
  vatRateBps: number;
  visibleDescription: string;
}) {
  return JSON.stringify([
    transaction.direction,
    transaction.date,
    transaction.categoryId,
    transaction.consultantId ?? "",
    transaction.netMinor,
    transaction.vatRateBps,
    transaction.visibleDescription.trim(),
  ]);
}

/**
 * Counts the fingerprints already in the portal, so a file row that matches
 * one is skipped once per existing payment: two identical rows in the file
 * against one in the portal still add the second.
 */
export class FingerprintPool {
  private readonly counts = new Map<string, number>();

  constructor(fingerprints: Iterable<string>) {
    for (const fingerprint of fingerprints)
      this.counts.set(fingerprint, (this.counts.get(fingerprint) ?? 0) + 1);
  }

  /** True, and uses one up, when the portal already has this payment. */
  take(fingerprint: string) {
    const count = this.counts.get(fingerprint) ?? 0;
    if (count === 0) return false;
    this.counts.set(fingerprint, count - 1);
    return true;
  }
}
