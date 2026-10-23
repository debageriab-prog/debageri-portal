import { z } from "zod";

export const receiptUploadSchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).default(""),
});

export function parseReceiptForm(form: FormData) {
  return receiptUploadSchema.safeParse({
    date: form.get("date"),
    name: form.get("name"),
    description: form.get("description") ?? "",
  });
}

export const receiptReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});
