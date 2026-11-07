import { z } from "zod";
import { VACATION_DAY_MINUTES } from "@/domain/vacation/periods";

const MAX_BALANCE_MINUTES = 200 * VACATION_DAY_MINUTES;

export const vacationSettingsSchema = z
  .object({
    resetMonth: z.number().int().min(1).max(12),
    resetDay: z.number().int().min(1).max(31),
    daysPerYear: z.number().int().min(0).max(60),
    supplementBps: z.number().int().min(0).max(10_000),
  })
  .refine(
    // Feb 29 is allowed and moves to Feb 28 in other years.
    (value) =>
      value.resetDay <=
      new Date(Date.UTC(2028, value.resetMonth, 0)).getUTCDate(),
    { message: "Invalid reset date" },
  );

const balanceMinutes = z.number().int().min(0).max(MAX_BALANCE_MINUTES);

export const vacationOpeningSchema = z.object({
  normalMinutes: balanceMinutes,
  advanceMinutes: balanceMinutes,
});

export const vacationActionSchema = z.object({
  action: z.literal("adjustBalance"),
  normalMinutes: balanceMinutes,
  savedMinutes: balanceMinutes,
  advanceMinutes: balanceMinutes,
  note: z.string().trim().min(3).max(300),
});
