import type { CompensationModel } from "@/domain/types";
import type { SalaryLine } from "./articles";
import type { TaxAdjustment, TaxColumn } from "./tax";
import type { SalaryTotals } from "./totals";

/**
 * One person's salary for one month moves from `initiated` (being prepared)
 * to `ready` (checked), `payslipGenerated` and finally `booked` in income and
 * expenses. Until it is booked it can be reopened for changes.
 */
export const SALARY_SLIP_STATUSES = [
  "initiated",
  "ready",
  "payslipGenerated",
  "booked",
] as const;
export type SalarySlipStatus = (typeof SALARY_SLIP_STATUSES)[number];

/** Why a salary cannot be worked out yet; the row stays in `initiated`. */
export type SalarySlipProblem =
  "payrollProfileMissing" | "taxTableMissing" | "oneTimeTaxTableMissing" | null;

export interface SalarySlipPerson {
  displayName: string;
  employeeNumber: string;
  personalNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  bankClearing: string;
  bankAccount: string;
}

export interface SalarySlipTax {
  year: number;
  table: number | null;
  column: TaxColumn;
  adjustment: TaxAdjustment;
  /** Typed by hand; replaces the table tax. */
  overrideMinor: number | null;
}

export interface SalaryYearToDate {
  grossMinor: number;
  benefitsMinor: number;
  taxMinor: number;
  /** One-time payments (engångsbelopp); missing on older slips. */
  oneTimeMinor?: number;
}

export interface SalarySlip {
  id: string;
  organizationId: string;
  userId: string;
  /** The month paid, `YYYY-MM`. */
  period: string;
  paymentDate: string;
  eventFrom: string;
  eventTo: string;
  status: SalarySlipStatus;
  problem: SalarySlipProblem;
  model: CompensationModel;
  /** Whether the salary is paid from the person's own balance. */
  fundedByConsultant: boolean;
  person: SalarySlipPerson;
  tax: SalarySlipTax;
  lines: SalaryLine[];
  totals: SalaryTotals;
  /** Earlier booked salaries of the same calendar year. */
  yearToDate: SalaryYearToDate;
  vacation: { paidDays: number; savedDays: number } | null;
  payslipId: string | null;
  transactionIds: string[];
  version: number;
}

export function salarySlipId(
  organizationId: string,
  userId: string,
  period: string,
) {
  return `${organizationId}_${userId}_${period}`;
}

export function salaryRunId(organizationId: string, period: string) {
  return `${organizationId}_${period}`;
}

/** A `YYYY-MM` month between 2020 and 2100. */
export function validSalaryPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2020 && year <= 2100 && month >= 1 && month <= 12;
}

/** The 25th of the paid month, the most common Swedish salary day. */
export function defaultPaymentDate(period: string) {
  return `${period}-25`;
}

/** Which status changes someone may make by hand. */
export function canMoveSlip(from: SalarySlipStatus, to: SalarySlipStatus) {
  if (to === "ready") return from === "initiated";
  if (to === "initiated")
    return from === "ready" || from === "payslipGenerated";
  return false;
}
