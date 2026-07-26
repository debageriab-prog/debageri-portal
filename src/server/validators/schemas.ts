import { z } from "zod";

export const timeEntryInputSchema = z.object({
  date: z.iso.date(),
  timeCodeId: z.string().min(1).max(128),
  minutes: z.number().int().positive().max(1_440),
  comment: z.string().trim().max(500).nullable().optional(),
  projectId: z.string().trim().max(128).nullable().optional(),
});

export const rejectTimesheetSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
});

export const transitionRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});

export const reportRangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    ({ from, to }) => from <= to,
    "The start date must precede the end date",
  );
