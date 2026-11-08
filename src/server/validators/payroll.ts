import { z } from "zod";
import { normalizePersonalNumber } from "@/domain/salary/personal-number";
import { TAX_COLUMNS } from "@/domain/salary/tax";

const text = (max: number) => z.string().trim().max(max).default("");

const taxAdjustmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("percent"),
    bps: z.number().int().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("amount"),
    minor: z.number().int().min(0).max(10_000_000_000),
  }),
]);

export const payrollProfileSchema = z
  .object({
    personalNumber: text(13).transform((value, context) => {
      if (!value) return "";
      const normalized = normalizePersonalNumber(value);
      if (!normalized) {
        context.addIssue({ code: "custom", message: "personalNumberInvalid" });
        return z.NEVER;
      }
      return normalized;
    }),
    addressLine: text(120),
    postalCode: text(10),
    city: text(60),
    municipalityCode: z
      .string()
      .trim()
      .regex(/^(\d{4})?$/)
      .default(""),
    municipalityName: text(60),
    churchMember: z.boolean().default(false),
    parish: text(80),
    taxTable: z.number().int().min(1).max(99).nullable().default(null),
    taxColumn: z
      .number()
      .int()
      .refine((value) => TAX_COLUMNS.includes(value as 1))
      .default(1),
    taxAdjustment: taxAdjustmentSchema.default({ type: "none" }),
    bankClearing: z
      .string()
      .trim()
      .regex(/^(\d{4,5})?$/)
      .default(""),
    bankAccount: z
      .string()
      .trim()
      .regex(/^[\d -]{0,20}$/)
      .default(""),
  })
  .transform((value) => ({
    ...value,
    parish: value.churchMember ? value.parish : "",
  }));

export type PayrollProfileInput = z.output<typeof payrollProfileSchema>;

export const taxTableImportSchema = z.object({
  year: z.number().int().min(2020).max(2100),
});
