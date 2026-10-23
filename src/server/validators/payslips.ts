import { z } from "zod";

export const payslipUploadSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  replaceExisting: z.boolean(),
});

export function parsePayslipForm(form: FormData) {
  return payslipUploadSchema.safeParse({
    userId: form.get("userId"),
    year: form.get("year"),
    month: form.get("month"),
    replaceExisting: form.get("replaceExisting") === "true",
  });
}
