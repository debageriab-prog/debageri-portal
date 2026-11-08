import { z } from "zod";
import { SALARY_ARTICLE_CODES } from "@/domain/salary/articles";
import { validSalaryPeriod } from "@/domain/salary/slip";

const period = z.string().refine(validSalaryPeriod);
const date = z.iso.date();
const slipId = z.string().min(1).max(200);
const money = z.number().int().min(-10_000_000_000).max(10_000_000_000);

export const salaryLineSchema = z.object({
  id: z.string().min(1).max(80),
  article: z.enum(SALARY_ARTICLE_CODES as [string, ...string[]]),
  label: z.string().trim().max(80).default(""),
  from: date.nullable().default(null),
  to: date.nullable().default(null),
  scopeBps: z.number().int().min(0).max(10_000).default(10_000),
  quantityHundredths: z.number().int().min(-1_000_000).max(1_000_000),
  unitPriceMinor: money,
  manual: z.boolean().default(true),
});

export const generateSalaryRunSchema = z
  .object({
    action: z.literal("generateSalaryRun"),
    period,
    paymentDate: date,
    eventFrom: date,
    eventTo: date,
    /** The people to pay this month; others get no row. */
    userIds: z.array(z.string().min(1).max(128)).max(500),
  })
  .refine((value) => value.eventFrom <= value.eventTo);

export const updateSalarySlipSchema = z.object({
  action: z.literal("updateSalarySlip"),
  slipId,
  version: z.number().int().min(0),
  lines: z.array(salaryLineSchema).max(100),
  taxOverrideMinor: z.number().int().min(0).max(10_000_000_000).nullable(),
});

export const setSalarySlipTimeReportsSchema = z.object({
  action: z.literal("setSalarySlipTimeReports"),
  slipId,
  version: z.number().int().min(0),
  useTimeReports: z.boolean(),
});

export const removeSalarySlipSchema = z.object({
  action: z.literal("removeSalarySlip"),
  slipId,
});

export const setSalarySlipStatusSchema = z.object({
  action: z.literal("setSalarySlipStatus"),
  slipIds: z.array(slipId).min(1).max(200),
  status: z.enum(["ready", "initiated"]),
});

export const generatePayslipsSchema = z.object({
  action: z.literal("generatePayslips"),
  slipIds: z.array(slipId).min(1).max(200),
  /** Replaces an uploaded payslip for the same month. */
  replaceExisting: z.boolean().default(false),
});

export const bookSalarySlipsSchema = z.object({
  action: z.literal("bookSalarySlips"),
  slipIds: z.array(slipId).min(1).max(200),
  /** `net` books the payout; `netPlusTax` adds the withheld tax as well. */
  mode: z.enum(["net", "netPlusTax"]),
  employerFee: z.boolean(),
  employerFeeBps: z.number().int().min(0).max(10_000),
});

export const reverseSalarySlipSchema = z.object({
  action: z.literal("reverseSalarySlip"),
  slipId,
  reason: z.string().trim().min(3).max(300),
});

export type SalaryLineInput = z.output<typeof salaryLineSchema>;
