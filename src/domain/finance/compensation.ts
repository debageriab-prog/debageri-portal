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
  salaried: "salariedModel",
} as const;

export const COMPENSATION_MODELS = [
  "flexible",
  "fixed",
  "hybrid",
  "salaried",
] as const satisfies readonly CompensationModel[];

export function isCompensationModel(
  value: unknown,
): value is CompensationModel {
  return COMPENSATION_MODELS.includes(value as CompensationModel);
}

function isConsultantRole(role: string) {
  return role === "consultant" || role === "employee";
}

/** Consultants are always paid; other staff only when the company pays them. */
export function receivesSalary(user: {
  role: string;
  paysSalary?: boolean | null;
}) {
  return isConsultantRole(user.role) || user.paysSalary === true;
}

/** Roles that can be marked as paid by the company. */
export function canBePaidSalary(role: string) {
  return ["manager", "accountant", "admin"].includes(role);
}

/** Consultants pick how they are paid; other staff draw a monthly salary. */
export function compensationModelsFor(role: string): CompensationModel[] {
  return isConsultantRole(role)
    ? ["flexible", "fixed", "hybrid"]
    : ["salaried"];
}

/** The salary the person is paid each month under an agreement. */
export function monthlySalaryMinor(
  agreement: Pick<
    CompensationAgreement,
    "model" | "fixedMonthlySalaryMinor" | "requestedMonthlySalaryMinor"
  >,
) {
  return agreement.model === "flexible"
    ? (agreement.requestedMonthlySalaryMinor ?? 0)
    : (agreement.fixedMonthlySalaryMinor ?? 0);
}

/** Compensation form fields as entered; amounts are still text. */
export interface CompensationValues {
  model: CompensationModel;
  validFrom: string;
  validTo: string;
  sharePercent: string;
  fixedSalary: string;
  requestedSalary: string;
}

export function defaultCompensationValues(
  validFrom: string,
  model: CompensationModel = "flexible",
): CompensationValues {
  return {
    model,
    validFrom,
    validTo: "",
    sharePercent: model === "flexible" ? "90" : "",
    fixedSalary: "",
    requestedSalary: "",
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
      values.model === "flexible" || values.model === "hybrid"
        ? Math.round(Number(values.sharePercent) * 100)
        : 0,
    fixedMonthlySalaryMinor:
      values.model === "flexible" ? null : parseSek(values.fixedSalary),
    requestedMonthlySalaryMinor:
      values.model === "flexible" ? parseSek(values.requestedSalary) : null,
  };
}

/**
 * Why an agreement does not fit the person, or null when it does. Flexible
 * consultants name the salary they want paid from their balance; everyone
 * else has a fixed monthly salary.
 */
export function compensationProblem(
  person: { role: string; paysSalary?: boolean | null },
  input: Pick<
    CompensationAgreement,
    | "model"
    | "validFrom"
    | "validTo"
    | "shareBps"
    | "fixedMonthlySalaryMinor"
    | "requestedMonthlySalaryMinor"
  >,
): "compensationNotPaid" | "compensationInvalid" | null {
  if (!receivesSalary(person)) return "compensationNotPaid";
  if (!compensationModelsFor(person.role).includes(input.model))
    return "compensationInvalid";
  if (input.validTo && input.validTo < input.validFrom)
    return "compensationInvalid";
  const salary = input.fixedMonthlySalaryMinor;
  const requested = input.requestedMonthlySalaryMinor;
  switch (input.model) {
    case "flexible":
      return salary === null && requested !== null && requested > 0
        ? null
        : "compensationInvalid";
    case "hybrid":
      return input.shareBps > 0 &&
        salary !== null &&
        salary > 0 &&
        requested === null
        ? null
        : "compensationInvalid";
    case "fixed":
    case "salaried":
      return input.shareBps === 0 &&
        salary !== null &&
        salary > 0 &&
        requested === null
        ? null
        : "compensationInvalid";
  }
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
