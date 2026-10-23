import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import {
  buildNotification,
  isEmailKind,
  notificationLocale,
  notificationSettingsFrom,
  notificationTopic,
  notificationValuesFor,
  type InAppNotificationKind,
  type NotificationParams,
} from "@/domain/notifications";
import { getAdminServices } from "@/lib/firebase/admin";
import { decryptPassword } from "@/server/services/reminder-service";

type Recipient = { id: string; data: FirebaseFirestore.DocumentData };

export function portalUrlFrom(request: Request) {
  return process.env.NEXT_PUBLIC_PORTAL_URL ?? new URL(request.url).origin;
}

/**
 * Stores an in-app notification for every active recipient, then emails
 * them with the organization's SMTP settings when that is configured and
 * the topic is switched on. Email delivery is best effort and each attempt
 * is recorded in `emailNotifications`.
 */
async function deliver(
  db: Firestore,
  organizationId: string,
  kind: InAppNotificationKind,
  entityId: string,
  path: string,
  portalUrl: string,
  params: NotificationParams,
  candidates: Recipient[],
) {
  const recipients = candidates.filter(
    ({ data }) =>
      data.status === "active" && data.organizationId === organizationId,
  );
  if (!recipients.length) return;
  const batch = db.batch();
  for (const recipient of recipients)
    batch.create(db.collection("notifications").doc(), {
      organizationId,
      userId: recipient.id,
      kind,
      entityId,
      params,
      link: path,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  await batch.commit();

  if (!isEmailKind(kind)) return;
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
  const emailRecipients = recipients.filter(
    ({ data }) => typeof data.email === "string" && data.email.includes("@"),
  );
  if (!emailRecipients.length) return;
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
  for (const recipient of emailRecipients) {
    const locale = notificationLocale(recipient.data.locale);
    const email = buildNotification(kind, locale, {
      ...notificationValuesFor(params, locale),
      recipientName: String(recipient.data.displayName ?? recipient.data.email),
      organizationName,
      link: `${portalUrl}${path}`,
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

async function usersWithRoles(
  db: Firestore,
  organizationId: string,
  roles: string[],
): Promise<Recipient[]> {
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", organizationId)
    .where("role", "in", roles)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

function receiptParams(
  receipt: FirebaseFirestore.DocumentData,
): NotificationParams {
  return {
    personName: String(receipt.userName),
    receiptName: String(receipt.name),
    receiptDate: String(receipt.date),
    amountMinor: Number(receipt.netMinor ?? 0) + Number(receipt.vatMinor ?? 0),
    comment: String(receipt.reviewNote ?? ""),
  };
}

export function notifyReceiptSubmitted(receiptId: string, portalUrl: string) {
  return safely("receiptSubmitted", async () => {
    const { db } = getAdminServices();
    const receipt = (
      await db.collection("receipts").doc(receiptId).get()
    ).data();
    if (!receipt) return;
    const organizationId = String(receipt.organizationId);
    await deliver(
      db,
      organizationId,
      "receiptSubmitted",
      receiptId,
      "/receipts",
      portalUrl,
      receiptParams(receipt),
      await usersWithRoles(db, organizationId, ["admin", "accountant"]),
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
      "/receipts",
      portalUrl,
      receiptParams(receipt),
      [owner],
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
      "/documents/payslips",
      portalUrl,
      { year: Number(payslip.year), month: Number(payslip.month) },
      [owner],
    );
  });
}

export function notifyTimesheetSubmitted(
  timesheetId: string,
  portalUrl: string,
) {
  return safely("timesheetSubmitted", async () => {
    const { db } = getAdminServices();
    const sheet = (
      await db.collection("timesheets").doc(timesheetId).get()
    ).data();
    if (!sheet || sheet.status !== "submitted") return;
    const owner = await loadUser(db, sheet.userId);
    if (!owner) return;
    const organizationId = String(sheet.organizationId);
    // Managers review consultants' reports; admins review managers' reports.
    const reviewers = await usersWithRoles(
      db,
      organizationId,
      owner.data.role === "manager" ? ["admin"] : ["manager"],
    );
    await deliver(
      db,
      organizationId,
      "timesheetSubmitted",
      timesheetId,
      `/manager/approvals/${encodeURIComponent(timesheetId)}`,
      portalUrl,
      {
        personName: String(owner.data.displayName ?? ""),
        isoYear: Number(sheet.isoYear),
        isoWeek: Number(sheet.isoWeek),
      },
      reviewers.filter((reviewer) => reviewer.id !== owner.id),
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
      "/employee/timesheets",
      portalUrl,
      {
        isoYear: Number(sheet.isoYear),
        isoWeek: Number(sheet.isoWeek),
        comment:
          sheet.status === "rejected"
            ? String(sheet.rejectionReason ?? "")
            : "",
      },
      [owner],
    );
  });
}

/** Latest notifications for the signed-in user, newest first. */
export async function listNotifications(
  db: Firestore,
  organizationId: string,
  userId: string,
) {
  const snapshot = await db
    .collection("notifications")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      kind: String(data.kind) as InAppNotificationKind,
      params: (data.params ?? {}) as NotificationParams,
      link: String(data.link ?? "/"),
      read: data.read === true,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? "",
    };
  });
}

export async function markNotificationsRead(
  db: Firestore,
  organizationId: string,
  userId: string,
  ids: string[] | "all",
) {
  const refs =
    ids === "all"
      ? (
          await db
            .collection("notifications")
            .where("organizationId", "==", organizationId)
            .where("userId", "==", userId)
            .where("read", "==", false)
            .limit(400)
            .get()
        ).docs.map((doc) => doc.ref)
      : (
          await Promise.all(
            ids.map((id) => db.collection("notifications").doc(id).get()),
          )
        )
          .filter(
            (doc) =>
              doc.exists &&
              doc.data()?.organizationId === organizationId &&
              doc.data()?.userId === userId,
          )
          .map((doc) => doc.ref);
  if (!refs.length) return;
  const batch = db.batch();
  for (const ref of refs)
    batch.update(ref, { read: true, readAt: FieldValue.serverTimestamp() });
  await batch.commit();
}
