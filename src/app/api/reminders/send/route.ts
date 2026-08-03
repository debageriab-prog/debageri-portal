import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { sendReminderSchema } from "@/server/validators/reminder";
import { findMissingWeeks } from "@/domain/reminders/missing-weeks";
import {
  defaultReminderSubject,
  defaultReminderTemplate,
  sendReminderEmail,
} from "@/server/services/reminder-service";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !["admin", "manager", "accountant"].includes(actor.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = sendReminderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Select an employee." }, { status: 400 });

  const { db } = getAdminServices();
  const [userDoc, settingsDoc, templatesDoc, organizationDoc, sheets] =
    await Promise.all([
      db.collection("users").doc(parsed.data.userId).get(),
      db.collection("reminderSettings").doc(actor.organizationId).get(),
      db.collection("emailTemplates").doc(actor.organizationId).get(),
      db.collection("organizations").doc(actor.organizationId).get(),
      db
        .collection("timesheets")
        .where("userId", "==", parsed.data.userId)
        .get(),
    ]);
  const user = userDoc.data();
  if (
    !user ||
    user.organizationId !== actor.organizationId ||
    !["employee", "consultant"].includes(String(user.role))
  )
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const settings = settingsDoc.data();
  const reminderTemplate = templatesDoc.data()?.timeReportReminder;
  if (!settings?.encryptedPassword)
    return NextResponse.json(
      { error: "Reminder email settings are not configured." },
      { status: 409 },
    );
  const today = new Date().toISOString().slice(0, 10);
  const missing = findMissingWeeks(
    String(user.reportingStartDate ?? user.employmentStartDate ?? today),
    today,
    sheets.docs.map((doc) => ({
      isoYear: Number(doc.data().isoYear),
      isoWeek: Number(doc.data().isoWeek),
      status: String(doc.data().status),
    })),
  );
  if (!missing.length)
    return NextResponse.json(
      { error: "This employee has no missing time reports." },
      { status: 409 },
    );

  const reminderId = `${actor.organizationId}_${parsed.data.userId}_${today}`;
  const reminderRef = db.collection("reminderEvents").doc(reminderId);
  try {
    await reminderRef.create({
      organizationId: actor.organizationId,
      userId: parsed.data.userId,
      recipientEmail: String(user.email),
      sentBy: actor.id,
      sentByRole: actor.role,
      sentDate: today,
      missingWeeks: missing,
      status: "sending",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "6" || code.toLowerCase().includes("already"))
      return NextResponse.json(
        { error: "A reminder has already been sent to this employee today." },
        { status: 409 },
      );
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
        missingWeeks: missing
          .map(
            (week) =>
              `${week.isoYear}-W${String(week.isoWeek).padStart(2, "0")}`,
          )
          .join("\n"),
        organizationName: String(organizationDoc.data()?.name ?? "Debageri"),
        portalUrl:
          process.env.NEXT_PUBLIC_PORTAL_URL ?? new URL(request.url).origin,
      },
    });
    await reminderRef.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await reminderRef.delete();
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The reminder could not be sent: ${error.message}`
            : "The reminder could not be sent.",
      },
      { status: 502 },
    );
  }
}
