import type { CompensationModel } from "@/domain/types";
import type { SalaryLine } from "./articles";
import type { TaxAdjustment, TaxColumn } from "./tax";
import type { SalaryTotals } from "./totals";

/**
 * One person's salary for one month moves from `initiated` (being prepared)
 * to `ready` (checked), `payslipGenerated` (a PDF only finance sees, for a
 * last check) and finally `booked`, when the steps chosen at booking happen.
 * Until it is booked it can be reopened for changes.
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
  /** The generated payslip PDF, seen only by finance until published. */
  pdf: SalarySlipPdfFile | null;
  /** The payslip published to the person's Pay slips at booking. */
  payslipId: string | null;
  transactionIds: string[];
  version: number;
}

export interface SalarySlipPdfFile {
  storagePath: string;
  fileName: string;
  size: number;
  /** Expenses link to the file, so it is kept when the PDF is redone. */
  attached: boolean;
}

/** What booking a salary does; each step is chosen when booking. */
export interface SalaryBookingSteps {
  /** Publish the payslip to the person's Pay slips. */
  publishPayslip: boolean;
  /** Email the person that a payslip was published. */
  notifyEmployee: boolean;
  /** Create the salary expenses in income and expenses. */
  createExpenses: boolean;
  /** Attach the payslip PDF to each expense. */
  attachPayslip: boolean;
}

/**
 * The steps that can happen: an email needs a published payslip and an
 * attachment needs expenses. Null when nothing would happen.
 */
export function salaryBookingSteps(
  chosen: SalaryBookingSteps,
): SalaryBookingSteps | null {
  const steps = {
    publishPayslip: chosen.publishPayslip,
    notifyEmployee: chosen.publishPayslip && chosen.notifyEmployee,
    createExpenses: chosen.createExpenses,
    attachPayslip: chosen.createExpenses && chosen.attachPayslip,
  };
  return steps.publishPayslip || steps.createExpenses ? steps : null;
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

/** Lines added by hand, as opposed to built from the agreement and time. */
export const isAddedLine = (line: Pick<SalaryLine, "id">) =>
  line.id.startsWith("manual-");

/**
 * The lines added by hand to another month, ready to add to this one, such
 * as a benefit or deduction that repeats: new ids, and without the other
 * month's dates.
 */
export function copiedSalaryLines(
  lines: SalaryLine[],
  stamp: number,
): SalaryLine[] {
  return lines.filter(isAddedLine).map((line, index) => ({
    ...line,
    id: `manual-${stamp}-${index}`,
    from: null,
    to: null,
    manual: true,
  }));
}

/** The lines of last month marked to repeat, for a new row of this month. */
export function repeatedSalaryLines(
  lines: SalaryLine[],
  stamp: number,
): SalaryLine[] {
  return copiedSalaryLines(
    lines.filter((line) => line.repeat === true),
    stamp,
  );
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
