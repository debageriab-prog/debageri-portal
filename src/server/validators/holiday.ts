import { z } from "zod";

export const holidaySchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(2).max(100),
});
