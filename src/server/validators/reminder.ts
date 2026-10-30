import { z } from "zod";
import { EMAIL_TEMPLATE_KINDS } from "@/domain/notifications";

export const emailSettingsSchema = z.object({
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(500).optional(),
  fromEmail: z.string().email(),
  senderName: z.string().trim().min(1).max(120),
});

export const emailNotificationsSchema = z.object({
  notifications: z.object({
    receipts: z.boolean(),
    payslips: z.boolean(),
    timesheets: z.boolean(),
  }),
});

const notificationKind = z.enum(EMAIL_TEMPLATE_KINDS);
const templateText = {
  subject: z.string().trim().min(1).max(200),
  template: z.string().trim().min(1).max(10000),
};

export const emailTemplateSchema = z.union([
  z.object({ templateId: z.literal("time-report-reminder"), ...templateText }),
  z.object({
    templateId: notificationKind,
    locale: z.enum(["en-SE", "sv-SE"]),
    ...templateText,
  }),
  z.object({
    templateId: notificationKind,
    locale: z.enum(["en-SE", "sv-SE"]),
    reset: z.literal(true),
  }),
]);

export const sendReminderSchema = z.object({
  userId: z.string().min(1).max(128),
});
