import { TAX_COLUMNS, type TaxAdjustment, type TaxColumn } from "./tax";

/**
 * What payroll needs about a person: identity and address for the payslip,
 * and how their preliminary tax is withheld. Kept apart from the user
 * document, which the person can read, because it holds the personnummer.
 */
export interface PayrollProfile {
  /** `YYYYMMDD-XXXX`, or empty while unknown. */
  personalNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  /** Four-digit kommun code from Skatteverket, or empty. */
  municipalityCode: string;
  municipalityName: string;
  churchMember: boolean;
  /** The parish (församling) deciding the church fee, for members. */
  parish: string;
  /** Tax table number, such as 33; null until set. */
  taxTable: number | null;
  taxColumn: TaxColumn;
  taxAdjustment: TaxAdjustment;
  bankClearing: string;
  bankAccount: string;
}

export function emptyPayrollProfile(): PayrollProfile {
  return {
    personalNumber: "",
    addressLine: "",
    postalCode: "",
    city: "",
    municipalityCode: "",
    municipalityName: "",
    churchMember: false,
    parish: "",
    taxTable: null,
    taxColumn: 1,
    taxAdjustment: { type: "none" },
    bankClearing: "",
    bankAccount: "",
  };
}

export function payrollProfileId(organizationId: string, userId: string) {
  return `${organizationId}_${userId}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function adjustmentFrom(value: unknown): TaxAdjustment {
  const data = (value ?? {}) as Record<string, unknown>;
  if (data.type === "percent" && Number.isInteger(data.bps))
    return { type: "percent", bps: Number(data.bps) };
  if (data.type === "amount" && Number.isInteger(data.minor))
    return { type: "amount", minor: Number(data.minor) };
  return { type: "none" };
}

/** A stored profile, with defaults for anything missing. */
export function payrollProfileFrom(value: unknown): PayrollProfile {
  const data = (value ?? {}) as Record<string, unknown>;
  const column = Number(data.taxColumn);
  return {
    personalNumber: text(data.personalNumber),
    addressLine: text(data.addressLine),
    postalCode: text(data.postalCode),
    city: text(data.city),
    municipalityCode: text(data.municipalityCode),
    municipalityName: text(data.municipalityName),
    churchMember: data.churchMember === true,
    parish: text(data.parish),
    taxTable: Number.isInteger(data.taxTable) ? Number(data.taxTable) : null,
    taxColumn: TAX_COLUMNS.includes(column as TaxColumn)
      ? (column as TaxColumn)
      : 1,
    taxAdjustment: adjustmentFrom(data.taxAdjustment),
    bankClearing: text(data.bankClearing),
    bankAccount: text(data.bankAccount),
  };
}

/** What still blocks a payslip, as locale keys; empty when complete. */
export function payrollProfileGaps(profile: PayrollProfile) {
  const gaps: string[] = [];
  if (!profile.personalNumber) gaps.push("payrollGap_personalNumber");
  if (!profile.addressLine || !profile.postalCode || !profile.city)
    gaps.push("payrollGap_address");
  if (profile.taxAdjustment.type === "none" && profile.taxTable === null)
    gaps.push("payrollGap_taxTable");
  return gaps;
}
