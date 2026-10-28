import { z } from "zod";

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["anthropic", "openai"]),
  model: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:/-]+$/),
  apiKey: z.string().trim().min(10).max(500).optional(),
  features: z.object({ financeAttachments: z.boolean() }),
});

export const financeAttachmentReferenceSchema = z.object({
  entityId: z.string().min(1).max(200),
  attachmentId: z.string().min(1).max(200),
});
