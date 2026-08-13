import { z } from "zod";

export const contractFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    documentDate: z.iso.date(),
    validTo: z.iso.date().nullable(),
    ownerType: z.enum(["company", "consultant"]),
    consultantId: z.string().trim().max(128).nullable(),
    visibleToConsultant: z.boolean(),
    confidential: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.ownerType === "consultant" && !value.consultantId)
      context.addIssue({ code: "custom", message: "Consultant is required" });
    if (value.ownerType === "company" && value.consultantId)
      context.addIssue({
        code: "custom",
        message: "Company cannot have a consultant",
      });
    if (value.ownerType === "company" && value.visibleToConsultant)
      context.addIssue({
        code: "custom",
        message: "Company documents cannot be consultant-visible",
      });
  });

export function parseContractForm(form: FormData) {
  return contractFieldsSchema.safeParse({
    name: form.get("name"),
    documentDate: form.get("documentDate"),
    validTo: form.get("validTo") || null,
    ownerType: form.get("ownerType"),
    consultantId: form.get("consultantId") || null,
    visibleToConsultant: form.get("visibleToConsultant") === "true",
    confidential: form.get("confidential") === "true",
  });
}
