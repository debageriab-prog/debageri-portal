import { z } from "zod";

export const timeCodeSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(100),
  category: z.enum([
    "work",
    "overtime",
    "vacation",
    "parental_leave",
    "sick_leave",
    "care_leave",
    "unpaid_leave",
    "compensatory_leave",
    "holiday",
    "other",
  ]),
  hourlyRate: z.number().nonnegative().max(1_000_000),
  active: z.boolean(),
  requiresComment: z.boolean(),
  countsAsWorkedTime: z.boolean(),
});
