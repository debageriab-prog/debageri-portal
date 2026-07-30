import { z } from "zod";

export const reminderSettingsSchema = z.object({
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(500).optional(),
  fromEmail: z.string().email(),
  senderName: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  template: z.string().trim().min(1).max(10000),
});

export const sendReminderSchema = z.object({
  userId: z.string().min(1).max(128),
});
