import { calculateVatMinor } from "@/domain/finance/calculations";

/**
 * Invoice rows like "144 h × 850,00 = 122 400,00". Quantities are stored in
 * thousandths so 7,5 h is 7500; prices and amounts are öre. Integer maths
 * only.
 */
export type InvoiceLine = {
  /** The invoice article the row was made from, if any. */
  articleId?: string | null;
  articleNumber: string;
  description: string;
  quantityThousandths: number;
  unit: string;
  unitPriceMinor: number;
  amountMinor: number;
};

export const MAX_INVOICE_LINES = 30;
export const INVOICE_UNITS = ["h", "st", "dag", "mån"] as const;

/** Quantity × unit price, rounded to whole öre (halves away from zero). */
export function lineAmountMinor(
  quantityThousandths: number,
  unitPriceMinor: number,
) {
  const product = BigInt(quantityThousandths) * BigInt(unitPriceMinor);
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const rounded = (absolute + 500n) / 1000n;
  return Number(negative ? -rounded : rounded);
}

export function withLineAmount(
  line: Omit<InvoiceLine, "amountMinor">,
): InvoiceLine {
  return {
    ...line,
    amountMinor: lineAmountMinor(line.quantityThousandths, line.unitPriceMinor),
  };
}

export function linesNetMinor(lines: readonly InvoiceLine[]) {
  return lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

/**
 * Öresavrundning that brings the total to whole kronor, as Fortnox does:
 * 153 000,40 gets -0,40 and 153 000,60 gets +0,40.
 */
export function kronorRoundingMinor(totalBeforeRoundingMinor: number) {
  const remainder = ((totalBeforeRoundingMinor % 100) + 100) % 100;
  if (remainder === 0) return 0;
  return remainder >= 50 ? 100 - remainder : -remainder;
}

export function invoiceTotals(
  lines: readonly InvoiceLine[],
  vatRateBps: number,
  roundingMinor = 0,
) {
  const netMinor = linesNetMinor(lines);
  const vatMinor = calculateVatMinor(netMinor, vatRateBps);
  return {
    netMinor,
    vatMinor,
    roundingMinor,
    grossMinor: netMinor + vatMinor + roundingMinor,
  };
}

/**
 * Whether a stored invoice was made with the invoice generator. The saved
 * choice wins; invoices saved before the choice existed count as generator
 * invoices only when they have article rows.
 */
export function madeWithGenerator(invoice: {
  useGenerator?: unknown;
  lines?: unknown;
}): boolean {
  if (typeof invoice.useGenerator === "boolean") return invoice.useGenerator;
  return (
    Array.isArray(invoice.lines) &&
    invoice.lines.some(
      (line) =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as { articleId?: unknown }).articleId === "string" &&
        (line as { articleId: string }).articleId !== "",
    )
  );
}

/** Older invoices have one amount and no rows; they print as one row. */
export function linesForInvoice(invoice: {
  lines?: readonly InvoiceLine[] | null;
  netMinor: number;
  visibleDescription?: string;
}): InvoiceLine[] {
  if (invoice.lines?.length) return [...invoice.lines];
  return [
    {
      articleNumber: "",
      description: invoice.visibleDescription?.trim() || "",
      quantityThousandths: 1000,
      unit: "st",
      unitPriceMinor: invoice.netMinor,
      amountMinor: invoice.netMinor,
    },
  ];
}

/** "144", "7,5" or "0,25" in Swedish; "7.5" in English. */
export function formatQuantity(quantityThousandths: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(quantityThousandths / 1000);
}

/** Reads "7,5" or "7.5" as 7500 thousandths; NaN when it is not a number. */
export function parseQuantity(value: string) {
  const clean = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,3})?$/.test(clean)) return Number.NaN;
  const [whole = "0", fraction = ""] = clean.replace("-", "").split(".");
  const thousandths =
    Number(whole) * 1000 + Number(fraction.padEnd(3, "0") || "0");
  return clean.startsWith("-") ? -thousandths : thousandths;
}
