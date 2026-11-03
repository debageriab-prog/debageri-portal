import { z } from "zod";
import { MAX_TRUSTED_SENDERS } from "@/domain/incoming-email";

const mailboxFields = {
  imapHost: z.string().trim().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  imapUsername: z.string().trim().min(1).max(320),
  /** Left out to keep the stored password. */
  password: z.string().min(1).max(500).optional(),
  folder: z.string().trim().min(1).max(200),
};

export const incomingEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  ...mailboxFields,
  trustedSenders: z
    .array(z.string().trim().toLowerCase().max(254).pipe(z.email()))
    .max(MAX_TRUSTED_SENDERS)
    .refine((senders) => new Set(senders).size === senders.length, {
      message: "Each email address can only be added once.",
    }),
});

/** Tries the mailbox as typed in the form, before or without saving it. */
export const incomingEmailConnectionSchema = z.object(mailboxFields);

export const incomingEmailActionSchema = z.object({
  action: z.enum(["dismiss", "restore", "retry"]),
});
