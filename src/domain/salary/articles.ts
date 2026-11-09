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
 * - `reimbursement`: tax-free repayment of something the person paid for,
 *   added to the payout after tax (utlägg)
 * - `extraTax`: extra preliminary tax the person asked to have withheld
 *   (frivillig extra skatt), counted as withheld tax
 */
export type SalaryLineKind =
  | "pay"
  | "benefit"
  | "grossDeduction"
  | "netDeduction"
  | "reimbursement"
  | "extraTax";

export const SALARY_ARTICLES = {
  monthlySalary: { kind: "pay" },
  vacationSupplement: { kind: "pay" },
  unpaidVacation: { kind: "pay" },
  unpaidLeave: { kind: "pay" },
  parentalLeave: { kind: "pay" },
  careLeave: { kind: "pay" },
  sickLeave: { kind: "pay" },
  sickLeaveFull: { kind: "pay" },
  sickWaitingDay: { kind: "pay" },
  bonus: { kind: "pay" },
  otherPay: { kind: "pay" },
  benefit: { kind: "benefit" },
  grossDeduction: { kind: "grossDeduction" },
  netDeduction: { kind: "netDeduction" },
  reimbursement: { kind: "reimbursement" },
  extraTax: { kind: "extraTax" },
} as const satisfies Record<string, { kind: SalaryLineKind }>;

export type SalaryArticle = keyof typeof SALARY_ARTICLES;
export const SALARY_ARTICLE_CODES = Object.keys(
  SALARY_ARTICLES,
) as SalaryArticle[];

/** How a line added by hand changes the payout: paid out, or taken off. */
export type SalaryLineDirection = "payment" | "deduction";

/** The tax treatment someone can pick for a line added by hand. */
export const MANUAL_SALARY_ARTICLES: Record<
  SalaryLineDirection,
  SalaryArticle[]
> = {
  payment: ["otherPay", "reimbursement", "benefit"],
  deduction: [
    "grossDeduction",
    "netDeduction",
    "extraTax",
    "unpaidLeave",
    "sickLeave",
    "sickLeaveFull",
    "sickWaitingDay",
  ],
};

/** Common things a line is for; each can be a payment or a deduction. */
export const SALARY_LINE_ITEMS = [
  "bonus",
  "overtime",
  "commission",
  "equipment",
  "phone",
  "computer",
  "lunch",
  "travel",
  "training",
  "parking",
  "healthInsurance",
  "bike",
  "car",
  "fuel",
  "wellness",
  "advance",
] as const;
export type SalaryLineItem = (typeof SALARY_LINE_ITEMS)[number];

/** Whether a line pays out or takes off, from its kind and sign. */
export function lineDirection(
  line: Pick<SalaryLine, "article" | "unitPriceMinor">,
): SalaryLineDirection {
  const kind = articleKind(line.article);
  if (
    kind === "grossDeduction" ||
    kind === "netDeduction" ||
    kind === "extraTax"
  )
    return "deduction";
  return line.unitPriceMinor < 0 ? "deduction" : "payment";
}

export interface SalaryLine {
  id: string;
  article: SalaryArticle;
  /** Free text; when empty the item's or the article's name is shown. */
  label: string;
  /** A common item such as equipment or lunch, or null. */
  item?: SalaryLineItem | null;
  /** Optional detail printed after the name on the payslip. */
  description?: string;
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
  /** A one-time payment (engångsbelopp), taxed with engångsskatt. */
  oneTime?: boolean;
  /** Added by hand and added again when next month's salaries are made. */
  repeat?: boolean;
}

export function articleKind(article: SalaryArticle): SalaryLineKind {
  return SALARY_ARTICLES[article].kind;
}

/**
 * The car benefit (bilförmån) and fuel benefit (drivmedelsförmån) among the
 * benefit lines, in öre. Skatteverket wants them apart from other benefits.
 */
export function carBenefitsMinor(lines: SalaryLine[]) {
  let carMinor = 0;
  let fuelMinor = 0;
  for (const line of lines) {
    if (articleKind(line.article) !== "benefit") continue;
    if (line.item === "car") carMinor += lineAmountMinor(line);
    if (line.item === "fuel") fuelMinor += lineAmountMinor(line);
  }
  return { carMinor, fuelMinor };
}

/** Quantity × price × scope, in whole öre. */
export function lineAmountMinor(
  line: Pick<SalaryLine, "quantityHundredths" | "unitPriceMinor" | "scopeBps">,
) {
  return Math.round(
    (line.quantityHundredths * line.unitPriceMinor * line.scopeBps) / 1_000_000,
  );
}
