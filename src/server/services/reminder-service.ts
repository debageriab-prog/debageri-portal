import "server-only";

import crypto from "node:crypto";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import {
  formatMissingWeek,
  type MissingWeek,
} from "@/domain/reminders/missing-weeks";
import { getAdminServices } from "@/lib/firebase/admin";

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

/**
 * Records and emails one reminder. The event id keeps it from going out twice;
 * a failed send removes the event so it can be tried again. Returns false when
 * the reminder had already been sent and rethrows email failures.
 */
export async function deliverReminder(input: {
  reminderId: string;
  organizationId: string;
  userId: string;
  user: DocumentData;
  settings: DocumentData;
  reminderTemplate: DocumentData | undefined;
  organizationName: string;
  portalUrl: string;
  today: string;
  missing: MissingWeek[];
  sentBy: string;
  sentByRole: string;
}) {
  const { user, settings, reminderTemplate } = input;
  const { db } = getAdminServices();
  const reminderRef = db.collection("reminderEvents").doc(input.reminderId);
  try {
    await reminderRef.create({
      organizationId: input.organizationId,
      userId: input.userId,
      recipientEmail: String(user.email),
      sentBy: input.sentBy,
      sentByRole: input.sentByRole,
      sentDate: input.today,
      missingWeeks: input.missing,
      status: "sending",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "6" || code.toLowerCase().includes("already")) return false;
    throw error;
  }

  try {
    await sendReminderEmail({
      smtpHost: String(settings.smtpHost),
      smtpPort: Number(settings.smtpPort),
      smtpSecure: Boolean(settings.smtpSecure),
      smtpUsername: String(settings.smtpUsername),
      encryptedPassword: String(settings.encryptedPassword),
      fromEmail: String(settings.fromEmail),
      senderName: String(settings.senderName),
      subject: String(
        reminderTemplate?.subject ?? settings.subject ?? defaultReminderSubject,
      ),
      template: String(
        reminderTemplate?.template ??
          settings.template ??
          defaultReminderTemplate,
      ),
      recipientEmail: String(user.email),
      values: {
        employeeName: String(user.displayName ?? user.email),
        missingWeeks: input.missing.map(formatMissingWeek).join("\n"),
        organizationName: input.organizationName,
        portalUrl: input.portalUrl,
      },
    });
  } catch (error) {
    await reminderRef.delete();
    throw error;
  }
  await reminderRef.update({
    status: "sent",
    sentAt: FieldValue.serverTimestamp(),
  });
  return true;
}
