import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { formatSek } from "@/domain/finance/calculations";
import {
  buildNotification,
  formatIsoWeek,
  notificationLocale,
  notificationSettingsFrom,
  notificationTopic,
  type NotificationKind,
  type NotificationLocale,
  type NotificationValues,
} from "@/domain/notifications";
import { formatPayslipMonth } from "@/domain/payslips";
import { getAdminServices } from "@/lib/firebase/admin";
import { decryptPassword } from "@/server/services/reminder-service";

type Recipient = { id: string; data: FirebaseFirestore.DocumentData };
type Message = {
  recipient: Recipient;
  values: (
    locale: NotificationLocale,
  ) => Omit<NotificationValues, "recipientName" | "organizationName" | "link">;
};

export function portalUrlFrom(request: Request) {
  return process.env.NEXT_PUBLIC_PORTAL_URL ?? new URL(request.url).origin;
}

/**
 * Sends notification emails with the organization's SMTP settings. Delivery
 * is best effort: missing settings, a switched-off topic or an SMTP error
 * never fails the action that triggered it. Each attempt is recorded in
 * `emailNotifications`.
 */
async function deliver(
  db: Firestore,
  organizationId: string,
  kind: NotificationKind,
  entityId: string,
  link: string,
  messages: Message[],
) {
  const [settingsDoc, organizationDoc] = await Promise.all([
    db.collection("reminderSettings").doc(organizationId).get(),
    db.collection("organizations").doc(organizationId).get(),
  ]);
  const settings = settingsDoc.data();
  if (!settings?.encryptedPassword) return;
  if (
    !notificationSettingsFrom(settings.notifications)[notificationTopic[kind]]
  )
    return;
  const recipients = messages.filter(
    ({ recipient }) =>
      recipient.data.status === "active" &&
      recipient.data.organizationId === organizationId &&
      typeof recipient.data.email === "string" &&
      recipient.data.email.includes("@"),
  );
  if (!recipients.length) return;
  const transporter = nodemailer.createTransport({
    host: String(settings.smtpHost),
    port: Number(settings.smtpPort),
    secure: Boolean(settings.smtpSecure),
    auth: {
      user: String(settings.smtpUsername),
      pass: decryptPassword(String(settings.encryptedPassword)),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const organizationName = String(organizationDoc.data()?.name ?? "Debageri");
  for (const { recipient, values } of recipients) {
    const locale = notificationLocale(recipient.data.locale);
    const email = buildNotification(kind, locale, {
      ...values(locale),
      recipientName: String(recipient.data.displayName ?? recipient.data.email),
      organizationName,
      link,
    });
    let error: string | null = null;
    try {
      await transporter.sendMail({
        from: {
          name: String(settings.senderName),
          address: String(settings.fromEmail),
        },
        to: String(recipient.data.email),
        subject: email.subject,
        text: email.text,
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 300) : "error";
      console.error("Notification email failed", {
        organizationId,
        kind,
        entityId,
        recipientUserId: recipient.id,
        error,
      });
    }
    await db.collection("emailNotifications").add({
      organizationId,
      kind,
      entityId,
      recipientUserId: recipient.id,
      status: error ? "failed" : "sent",
      error,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

async function safely(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    console.error(`Notification ${label} failed`, {
      errorClass: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : undefined,
    });
  }
}

async function loadUser(db: Firestore, id: string): Promise<Recipient | null> {
  const snapshot = await db.collection("users").doc(String(id)).get();
  return snapshot.exists ? { id: snapshot.id, data: snapshot.data()! } : null;
}

function receiptValues(receipt: FirebaseFirestore.DocumentData) {
  return (locale: NotificationLocale) => ({
    personName: String(receipt.userName),
    receiptName: String(receipt.name),
    receiptDate: String(receipt.date),
    amount: formatSek(
      Number(receipt.netMinor ?? 0) + Number(receipt.vatMinor ?? 0),
      locale,
    ),
    comment: String(receipt.reviewNote ?? ""),
  });
}

export function notifyReceiptSubmitted(receiptId: string, portalUrl: string) {
  return safely("receiptSubmitted", async () => {
    const { db } = getAdminServices();
    const receipt = (
      await db.collection("receipts").doc(receiptId).get()
    ).data();
    if (!receipt) return;
    const reviewers = await db
      .collection("users")
      .where("organizationId", "==", receipt.organizationId)
      .where("role", "in", ["admin", "accountant"])
      .get();
    await deliver(
      db,
      String(receipt.organizationId),
      "receiptSubmitted",
      receiptId,
      `${portalUrl}/receipts`,
      reviewers.docs.map((doc) => ({
        recipient: { id: doc.id, data: doc.data() },
        values: receiptValues(receipt),
      })),
    );
  });
}

export function notifyReceiptReviewed(receiptId: string, portalUrl: string) {
  return safely("receiptReviewed", async () => {
    const { db } = getAdminServices();
    const receipt = (
      await db.collection("receipts").doc(receiptId).get()
    ).data();
    if (!receipt || !["approved", "rejected"].includes(receipt.status)) return;
    const owner = await loadUser(db, receipt.userId);
    if (!owner) return;
    await deliver(
      db,
      String(receipt.organizationId),
      receipt.status === "approved" ? "receiptApproved" : "receiptRejected",
      receiptId,
      `${portalUrl}/receipts`,
      [{ recipient: owner, values: receiptValues(receipt) }],
    );
  });
}

export function notifyPayslipPublished(payslipId: string, portalUrl: string) {
  return safely("payslipPublished", async () => {
    const { db } = getAdminServices();
    const payslip = (
      await db.collection("payslips").doc(payslipId).get()
    ).data();
    if (!payslip) return;
    const owner = await loadUser(db, payslip.userId);
    // People without pay slip access cannot open it, so they are not told.
    if (!owner || owner.data.documentAccess?.payslips !== true) return;
    await deliver(
      db,
      String(payslip.organizationId),
      "payslipPublished",
      payslipId,
      `${portalUrl}/documents/payslips`,
      [
        {
          recipient: owner,
          values: (locale) => ({
            month: formatPayslipMonth(
              locale,
              Number(payslip.year),
              Number(payslip.month),
            ),
          }),
        },
      ],
    );
  });
}

export function notifyTimesheetDecision(
  timesheetId: string,
  portalUrl: string,
) {
  return safely("timesheetDecision", async () => {
    const { db } = getAdminServices();
    const sheet = (
      await db.collection("timesheets").doc(timesheetId).get()
    ).data();
    if (!sheet || !["approved", "rejected"].includes(sheet.status)) return;
    const owner = await loadUser(db, sheet.userId);
    if (!owner) return;
    await deliver(
      db,
      String(sheet.organizationId),
      sheet.status === "approved" ? "timesheetApproved" : "timesheetRejected",
      timesheetId,
      `${portalUrl}/employee/timesheets`,
      [
        {
          recipient: owner,
          values: (locale) => ({
            week: formatIsoWeek(
              locale,
              Number(sheet.isoYear),
              Number(sheet.isoWeek),
            ),
            comment:
              sheet.status === "rejected"
                ? String(sheet.rejectionReason ?? "")
                : "",
          }),
        },
      ],
    );
  });
}
