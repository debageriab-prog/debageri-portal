import { z } from "zod";
import {
  SALARY_ARTICLE_CODES,
  SALARY_LINE_ITEMS,
} from "@/domain/salary/articles";
import { validSalaryPeriod } from "@/domain/salary/slip";

const period = z.string().refine(validSalaryPeriod);
const date = z.iso.date();
const slipId = z.string().min(1).max(200);
const money = z.number().int().min(-10_000_000_000).max(10_000_000_000);

export const salaryLineSchema = z.object({
  id: z.string().min(1).max(80),
  article: z.enum(SALARY_ARTICLE_CODES as [string, ...string[]]),
  label: z.string().trim().max(80).default(""),
  item: z.enum(SALARY_LINE_ITEMS).nullable().default(null),
  description: z.string().trim().max(120).default(""),
  from: date.nullable().default(null),
  to: date.nullable().default(null),
  scopeBps: z.number().int().min(0).max(10_000).default(10_000),
  quantityHundredths: z.number().int().min(-1_000_000).max(1_000_000),
  unitPriceMinor: money,
  manual: z.boolean().default(true),
  oneTime: z.boolean().default(false),
  /** Added again when next month's salaries are generated. */
  repeat: z.boolean().default(false),
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
});

export const bookSalarySlipsSchema = z.object({
  action: z.literal("bookSalarySlips"),
  slipIds: z.array(slipId).min(1).max(200),
  publishPayslip: z.boolean(),
  notifyEmployee: z.boolean(),
  createExpenses: z.boolean(),
  attachPayslip: z.boolean(),
  /** Replaces an uploaded payslip for the same month when publishing. */
  replaceExisting: z.boolean().default(false),
  /**
   * `net` books the payout; `netPlusTax` adds the withheld tax as its own
   * expense; `gross` books payout and tax as one salary expense.
   */
  mode: z.enum(["net", "netPlusTax", "gross"]),
  /** Employer contributions at each person's rate for their age. */
  employerFee: z.boolean(),
});

export const reverseSalarySlipSchema = z.object({
  action: z.literal("reverseSalarySlip"),
  slipId,
  reason: z.string().trim().min(3).max(300),
});

export type SalaryLineInput = z.output<typeof salaryLineSchema>;

/** The month's AGI file and who Skatteverket contacts about it. */
export const salaryAgiFileSchema = z.object({
  period,
  contact: z.object({
    name: z.string().trim().min(1).max(50),
    phone: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[^<>]*$/),
    email: z.email().max(254),
  }),
});
