import { articleKind, lineAmountMinor, type SalaryLine } from "./articles";
import { oneTimeTaxMinor, oneTimeTaxPercent } from "./one-time-tax";
import {
  taxMinor,
  type TaxAdjustment,
  type TaxColumn,
  type TaxTable,
} from "./tax";

export interface SalaryTotals {
  /** Cash pay after gross deductions (Bruttolön). */
  grossMinor: number;
  /** Taxable benefits that are not paid out (Förmåner). */
  benefitsMinor: number;
  /** Gross pay plus benefits; tax and employer fees are worked out on it. */
  taxableMinor: number;
  /** Preliminary tax withheld, including any one-time tax. */
  taxMinor: number;
  /** Taxable one-time payments (engångsbelopp) such as a bonus. */
  oneTimeMinor: number;
  /** Engångsskatt on them; part of `taxMinor`. */
  oneTimeTaxMinor: number;
  /** The percent used for it, or null when the year's table is unknown. */
  oneTimePercent: number | null;
  netDeductionsMinor: number;
  /** Tax-free repayments added to the payout after tax. */
  reimbursementsMinor: number;
  /** Öresavrundning that makes the payout whole kronor. */
  roundingMinor: number;
  /** Paid to the person (Din lön). */
  netMinor: number;
}

export interface SalaryTaxBasis {
  table: Pick<TaxTable, "rows"> | null;
  column: TaxColumn;
  adjustment: TaxAdjustment;
  /** Set when someone typed the tax by hand; replaces the table tax. */
  overrideMinor?: number | null;
  /** The tax year, which picks the table for one-time payments. */
  year?: number;
  /** One-time payments already booked earlier in the year. */
  oneTimeEarlierMinor?: number;
}

export function salaryTotals(
  lines: SalaryLine[],
  tax: SalaryTaxBasis,
): SalaryTotals {
  let grossMinor = 0;
  let benefitsMinor = 0;
  let netDeductionsMinor = 0;
  let reimbursementsMinor = 0;
  let oneTimeMinor = 0;
  for (const line of lines) {
    const amount = lineAmountMinor(line);
    const kind = articleKind(line.article);
    if (kind === "benefit") benefitsMinor += amount;
    else if (kind === "netDeduction") netDeductionsMinor += amount;
    else if (kind === "reimbursement") reimbursementsMinor += amount;
    else {
      grossMinor += amount;
      if (kind === "pay" && line.oneTime) oneTimeMinor += amount;
    }
  }
  oneTimeMinor = Math.max(0, oneTimeMinor);
  const taxableMinor = grossMinor + benefitsMinor;
  // A jämkning percent covers one-time payments too, and typed tax replaces
  // everything; otherwise one-time payments are taxed apart, at a percent
  // chosen from the expected annual income.
  const separate =
    oneTimeMinor > 0 &&
    tax.overrideMinor == null &&
    tax.adjustment.type !== "percent";
  const regularTaxableMinor = separate
    ? taxableMinor - oneTimeMinor
    : taxableMinor;
  const oneTimePercent = separate
    ? oneTimeTaxPercent(tax.year ?? 0, tax.column, {
        regularTaxableMinor,
        oneTimeMinor,
        oneTimeEarlierMinor: tax.oneTimeEarlierMinor ?? 0,
      })
    : null;
  const oneTimeTax =
    separate && oneTimePercent !== null
      ? oneTimeTaxMinor(oneTimeMinor, oneTimePercent)
      : 0;
  const withheld =
    tax.overrideMinor ??
    taxMinor(tax.table, tax.column, regularTaxableMinor, tax.adjustment) +
      oneTimeTax;
  const beforeRounding =
    grossMinor - withheld + netDeductionsMinor + reimbursementsMinor;
  const netMinor = Math.max(0, Math.round(beforeRounding / 100) * 100);
  return {
    grossMinor,
    benefitsMinor,
    taxableMinor,
    taxMinor: withheld,
    oneTimeMinor,
    oneTimeTaxMinor: oneTimeTax,
    oneTimePercent,
    netDeductionsMinor,
    reimbursementsMinor,
    roundingMinor: netMinor - beforeRounding,
    netMinor,
  };
}

/** Arbetsgivaravgift on gross pay and benefits, in whole kronor. */
export function employerFeeMinor(taxableMinor: number, feeBps: number) {
  return Math.round((taxableMinor * feeBps) / 10_000 / 100) * 100;
}

/** The standard employer contribution rate, 31.42 %. */
export const DEFAULT_EMPLOYER_FEE_BPS = 3142;
