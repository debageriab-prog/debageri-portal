import "server-only";

import crypto from "node:crypto";
import nodemailer from "nodemailer";

export const defaultReminderSubject =
  "Reminder: missing time reports for {{employeeName}}";
export const defaultReminderTemplate = `Hi {{employeeName}},

This is a friendly reminder that the following time reports are missing:
{{missingWeeks}}

Please sign in at {{portalUrl}} and submit them when possible.

Best regards,
{{organizationName}}`;

function encryptionKey() {
  const secret = process.env.REMINDER_CREDENTIAL_ENCRYPTION_KEY;
  if (!secret)
    throw new Error("REMINDER_CREDENTIAL_ENCRYPTION_KEY is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptPassword(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptPassword(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted password.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function renderReminderTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /\{\{(employeeName|missingWeeks|organizationName|portalUrl)\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

export async function sendReminderEmail(settings: {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  encryptedPassword: string;
  fromEmail: string;
  senderName: string;
  subject: string;
  template: string;
  recipientEmail: string;
  values: Record<string, string>;
}) {
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUsername,
      pass: decryptPassword(settings.encryptedPassword),
    },
  });
  await transporter.sendMail({
    from: { name: settings.senderName, address: settings.fromEmail },
    to: settings.recipientEmail,
    subject: renderReminderTemplate(settings.subject, settings.values),
    text: renderReminderTemplate(settings.template, settings.values),
  });
}
