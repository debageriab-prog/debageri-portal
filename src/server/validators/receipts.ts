import { z } from "zod";

export const receiptUploadSchema = z
  .object({
    date: z.iso.date(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).default(""),
    netMinor: z.coerce.number().int().min(1).max(10_000_000_000),
    vatMinor: z.coerce.number().int().min(0).max(10_000_000_000),
  })
  .refine((value) => value.vatMinor <= value.netMinor, {
    message: "VAT cannot exceed the amount excluding VAT",
    path: ["vatMinor"],
  });

export function parseReceiptForm(form: FormData) {
  return receiptUploadSchema.safeParse({
    date: form.get("date"),
    name: form.get("name"),
    description: form.get("description") ?? "",
    netMinor: form.get("netMinor"),
    vatMinor: form.get("vatMinor"),
  });
}

export const receiptReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});
