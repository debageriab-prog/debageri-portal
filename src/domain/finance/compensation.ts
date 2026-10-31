import type { CompensationAgreement, CompensationModel } from "@/domain/types";
import { parseSek } from "@/domain/finance/calculations";

export type CompensationRecord = Omit<CompensationAgreement, "organizationId">;

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

export function compensationInput(values: CompensationValues) {
  const flexible = values.model === "flexible";
  return {
    model: values.model,
    validFrom: values.validFrom,
    validTo: values.validTo || null,
    shareBps: flexible ? Math.round(Number(values.sharePercent) * 100) : 0,
    fixedMonthlySalaryMinor: flexible ? null : parseSek(values.fixedSalary),
  };
}
