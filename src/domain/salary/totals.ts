import { articleKind, lineAmountMinor, type SalaryLine } from "./articles";
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
  /** Preliminary tax withheld. */
  taxMinor: number;
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
}

export function salaryTotals(
  lines: SalaryLine[],
  tax: SalaryTaxBasis,
): SalaryTotals {
  let grossMinor = 0;
  let benefitsMinor = 0;
  let netDeductionsMinor = 0;
  let reimbursementsMinor = 0;
  for (const line of lines) {
    const amount = lineAmountMinor(line);
    const kind = articleKind(line.article);
    if (kind === "benefit") benefitsMinor += amount;
    else if (kind === "netDeduction") netDeductionsMinor += amount;
    else if (kind === "reimbursement") reimbursementsMinor += amount;
    else grossMinor += amount;
  }
  const taxableMinor = grossMinor + benefitsMinor;
  const withheld =
    tax.overrideMinor ??
    taxMinor(tax.table, tax.column, taxableMinor, tax.adjustment);
  const beforeRounding =
    grossMinor - withheld + netDeductionsMinor + reimbursementsMinor;
  const netMinor = Math.max(0, Math.round(beforeRounding / 100) * 100);
  return {
    grossMinor,
    benefitsMinor,
    taxableMinor,
    taxMinor: withheld,
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
