import { z } from "zod";

const date = z.iso.date();
const minor = z.number().int().min(0).max(10_000_000_000);
const vatRateBps = z.number().int().min(0).max(10_000);

export const compensationSchema = z.object({
  action: z.literal("setCompensation"),
  userId: z.string().min(1).max(128),
  model: z.enum(["flexible", "fixed"]),
  validFrom: date,
  shareBps: z.number().int().min(0).max(10_000),
  fixedMonthlySalaryMinor: minor.nullable(),
});

export const categorySchema = z.object({
  action: z.literal("createCategory"),
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/),
  nameEn: z.string().trim().min(2).max(80),
  nameSv: z.string().trim().min(2).max(80),
  direction: z.enum(["income", "expense"]),
});

export const invoiceSchema = z.object({
  action: z.literal("createInvoice"),
  invoiceNumber: z.string().trim().min(1).max(60),
  consultantId: z.string().min(1).max(128).nullable(),
  customerName: z.string().trim().min(2).max(160),
  issueDate: date,
  dueDate: date,
  netMinor: minor,
  vatRateBps,
  visibleDescription: z.string().trim().max(300).default(""),
  internalNote: z.string().trim().max(1_000).default(""),
  shareBpsOverride: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .nullable()
    .default(null),
});

export const paymentSchema = z.object({
  action: z.literal("markInvoicePaid"),
  invoiceId: z.string().min(1).max(128),
  paidDate: date,
  categoryId: z.string().min(1).max(128),
});

export const transactionSchema = z.object({
  action: z.literal("createTransaction"),
  direction: z.enum(["income", "expense"]),
  categoryId: z.string().min(1).max(128),
  consultantId: z.string().min(1).max(128).nullable(),
  date,
  netMinor: minor,
  vatRateBps,
  funding: z.enum(["company", "consultant"]).nullable(),
  applyConsultantShare: z.boolean().default(false),
  visibleDescription: z.string().trim().max(300).default(""),
  internalNote: z.string().trim().max(1_000).default(""),
  importKey: z.string().trim().max(160).nullable().default(null),
});

export const voidSchema = z.object({
  action: z.literal("voidTransaction"),
  transactionId: z.string().min(1).max(128),
  reason: z.string().trim().min(3).max(300),
});

export const voidInvoiceSchema = z.object({
  action: z.literal("voidInvoice"),
  invoiceId: z.string().min(1).max(128),
  reason: z.string().trim().min(3).max(300),
});

export const financeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enableFinance") }),
  compensationSchema,
  categorySchema,
  invoiceSchema,
  paymentSchema,
  transactionSchema,
  voidSchema,
  voidInvoiceSchema,
]);
