export const RECEIPT_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isReceiptContentType(type: string) {
  return (RECEIPT_CONTENT_TYPES as readonly string[]).includes(type);
}

export function isReceiptStatus(value: unknown): value is ReceiptStatus {
  return (RECEIPT_STATUSES as readonly unknown[]).includes(value);
}

export type ReceiptFilter = {
  period: string | null;
  status: ReceiptStatus | "all";
  userId?: string;
};

export function filterReceipts<
  T extends { date: string; status: ReceiptStatus; userId: string },
>(receipts: T[], filter: ReceiptFilter) {
  return receipts.filter(
    (receipt) =>
      (!filter.period || receipt.date.startsWith(`${filter.period}-`)) &&
      (filter.status === "all" || receipt.status === filter.status) &&
      (!filter.userId || receipt.userId === filter.userId),
  );
}

/** Only approved receipts that are not yet booked can become an expense. */
export function canBecomeExpense(receipt: {
  status: ReceiptStatus;
  expenseTransactionId: string | null;
}) {
  return receipt.status === "approved" && !receipt.expenseTransactionId;
}

/**
 * VAT rate in basis points implied by a receipt's amounts, used to prefill
 * an expense. Rounded to whole basis points, so the expense VAT can differ
 * from the receipt by a few öre for unusual rates.
 */
export function receiptVatRateBps(netMinor: number, vatMinor: number) {
  if (netMinor <= 0 || vatMinor <= 0) return 0;
  return Math.min(10_000, Math.round((vatMinor * 10_000) / netMinor));
}
