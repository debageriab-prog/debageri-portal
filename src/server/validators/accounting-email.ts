import { z } from "zod";
import { NOTIFICATION_LOCALES } from "@/domain/notifications";

const contactSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  locale: z.enum(NOTIFICATION_LOCALES),
  transactions: z.boolean(),
  invoices: z.boolean(),
  vatSettlements: z.boolean(),
});

export const accountingContactsSchema = z.object({
  contacts: z
    .array(contactSchema)
    .max(20)
    .refine(
      (contacts) =>
        new Set(contacts.map((contact) => contact.email)).size ===
        contacts.length,
      { message: "Each email address can only be added once." },
    ),
});

export const sendAccountingEmailSchema = z.object({
  entityType: z.enum(["transaction", "invoice", "vatSettlement"]),
  entityId: z.string().min(1).max(128),
});
