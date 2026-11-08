/**
 * Salary articles: the kinds of line a payslip can hold. Amounts are öre,
 * quantities hundredths, and the scope (omfattning) basis points.
 */

/**
 * How a line counts:
 * - `pay`: cash salary, taxed (negative for deductions such as unpaid leave)
 * - `benefit`: förmån, taxed but not paid out
 * - `grossDeduction`: bruttolöneavdrag, lowers both pay and taxable income
 * - `netDeduction`: nettolöneavdrag, taken after tax
 */
export type SalaryLineKind =
  "pay" | "benefit" | "grossDeduction" | "netDeduction";

export const SALARY_ARTICLES = {
  monthlySalary: { kind: "pay" },
  vacationSupplement: { kind: "pay" },
  unpaidVacation: { kind: "pay" },
  unpaidLeave: { kind: "pay" },
  parentalLeave: { kind: "pay" },
  careLeave: { kind: "pay" },
  sickLeave: { kind: "pay" },
  sickWaitingDay: { kind: "pay" },
  bonus: { kind: "pay" },
  otherPay: { kind: "pay" },
  benefit: { kind: "benefit" },
  grossDeduction: { kind: "grossDeduction" },
  netDeduction: { kind: "netDeduction" },
} as const satisfies Record<string, { kind: SalaryLineKind }>;

export type SalaryArticle = keyof typeof SALARY_ARTICLES;
export const SALARY_ARTICLE_CODES = Object.keys(
  SALARY_ARTICLES,
) as SalaryArticle[];

/** Articles someone may add by hand on a salary row. */
export const MANUAL_SALARY_ARTICLES: SalaryArticle[] = [
  "bonus",
  "otherPay",
  "benefit",
  "grossDeduction",
  "netDeduction",
  "unpaidLeave",
  "sickLeave",
  "sickWaitingDay",
];

export interface SalaryLine {
  id: string;
  article: SalaryArticle;
  /** Free text; when empty the article's own name is shown. */
  label: string;
  /** First and last day the line covers, `YYYY-MM-DD`, when it has dates. */
  from: string | null;
  to: string | null;
  /** Omfattning in basis points; 10000 is 100 %. */
  scopeBps: number;
  /** Hundredths, so 3 days is 300. */
  quantityHundredths: number;
  /** Price per unit in öre; negative for a deduction. */
  unitPriceMinor: number;
  /** Added or changed by hand, so a rebuild keeps it. */
  manual: boolean;
}

export function articleKind(article: SalaryArticle): SalaryLineKind {
  return SALARY_ARTICLES[article].kind;
}

/** Quantity × price × scope, in whole öre. */
export function lineAmountMinor(
  line: Pick<SalaryLine, "quantityHundredths" | "unitPriceMinor" | "scopeBps">,
) {
  return Math.round(
    (line.quantityHundredths * line.unitPriceMinor * line.scopeBps) / 1_000_000,
  );
}
