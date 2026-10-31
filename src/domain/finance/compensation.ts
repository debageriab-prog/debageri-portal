import type {
  CompensationAgreement,
  CompensationModel,
  FinancialTransaction,
} from "@/domain/types";
import { parseSek } from "@/domain/finance/calculations";

/** Typed to confirm that a new period ends the open-ended one. */
export const COMPENSATION_END_CONFIRMATION = "I am sure";

export type CompensationRecord = Omit<CompensationAgreement, "organizationId">;

/** Locale key naming each compensation model. */
export const compensationModelLabels = {
  flexible: "flexible",
  fixed: "fixedSalary",
  hybrid: "fixedSalaryAndShare",
} as const;

/** Compensation form fields as entered; amounts are still text. */
export interface CompensationValues {
  model: CompensationModel;
  validFrom: string;
  validTo: string;
  sharePercent: string;
  fixedSalary: string;
}

export function defaultCompensationValues(
  validFrom: string,
): CompensationValues {
  return {
    model: "flexible",
    validFrom,
    validTo: "",
    sharePercent: "90",
    fixedSalary: "",
  };
}

export function previousDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function compensationInput(values: CompensationValues) {
  return {
    model: values.model,
    validFrom: values.validFrom,
    validTo: values.validTo || null,
    shareBps:
      values.model === "fixed"
        ? 0
        : Math.round(Number(values.sharePercent) * 100),
    fixedMonthlySalaryMinor:
      values.model === "flexible" ? null : parseSek(values.fixedSalary),
  };
}

export interface MonthlyCompensation {
  /** YYYY-MM */
  month: string;
  fixedMinor: number;
  shareMinor: number;
  totalMinor: number;
}

function nextMonth(month: string) {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return value.toISOString().slice(0, 7);
}

/**
 * What a hybrid consultant earned per month, newest first. The share is what
 * the ledger credited that month, so reversals reduce it, and a salary is not
 * prorated for a period starting or ending mid-month. A month with several
 * periods uses the one that started last.
 */
export function monthlyCompensation(
  agreements: CompensationRecord[],
  transactions: Array<
    Pick<
      FinancialTransaction,
      "consultantId" | "direction" | "date" | "consultantBalanceDeltaMinor"
    >
  >,
  consultantId: string,
  throughDate: string,
): MonthlyCompensation[] {
  const periods = agreements
    .filter((agreement) => agreement.userId === consultantId)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const first = periods.findLast((period) => period.model === "hybrid");
  if (!first) return [];
  const lastMonth = throughDate.slice(0, 7);
  const rows: MonthlyCompensation[] = [];
  for (
    let month = first.validFrom.slice(0, 7);
    month <= lastMonth;
    month = nextMonth(month)
  ) {
    const period = periods.find(
      (item) =>
        item.validFrom.slice(0, 7) <= month &&
        (item.validTo === null || item.validTo.slice(0, 7) >= month),
    );
    if (period?.model !== "hybrid") continue;
    const fixedMinor = period.fixedMonthlySalaryMinor ?? 0;
    const shareMinor = transactions
      .filter(
        (transaction) =>
          transaction.consultantId === consultantId &&
          transaction.direction === "income" &&
          transaction.date.startsWith(month),
      )
      .reduce(
        (sum, transaction) => sum + transaction.consultantBalanceDeltaMinor,
        0,
      );
    rows.push({
      month,
      fixedMinor,
      shareMinor,
      totalMinor: fixedMinor + shareMinor,
    });
  }
  return rows.reverse();
}
