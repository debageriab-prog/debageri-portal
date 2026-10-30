import { NextResponse } from "next/server";
import { resolvePortalUrl } from "@/lib/config/portal-url";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { sendReminderSchema } from "@/server/validators/reminder";
import {
  findMissingWeeks,
  receivesReminders,
  toReportedWeek,
} from "@/domain/reminders/missing-weeks";
import { countsCurrentWeek } from "@/domain/reminders/schedule";
import { deliverReminder } from "@/server/services/reminder-service";

/**
 * Sends a reminder to each selected consultant. Anyone with nothing missing or
 * already reminded today is skipped, and one failure does not stop the rest.
 */
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
  const [settingsDoc, templatesDoc, organizationDoc, holidayDocs] =
    await Promise.all([
      db.collection("reminderSettings").doc(actor.organizationId).get(),
      db.collection("emailTemplates").doc(actor.organizationId).get(),
      db.collection("organizations").doc(actor.organizationId).get(),
      db
        .collection("holidays")
        .where("organizationId", "==", actor.organizationId)
        .get(),
    ]);
  const settings = settingsDoc.data();
  if (!settings?.encryptedPassword)
    return NextResponse.json(
      { error: "Reminder email settings are not configured." },
      { status: 409 },
    );
  const today = stockholmDateTime().date;
  const includeCurrentWeek = countsCurrentWeek(
    today,
    new Set(holidayDocs.docs.map((doc) => String(doc.data().date))),
  );
  const summary = { sent: 0, skipped: 0, failed: 0, error: "" };

  for (const userId of new Set(parsed.data.userIds)) {
    const [userDoc, sheets] = await Promise.all([
      db.collection("users").doc(userId).get(),
      db.collection("timesheets").where("userId", "==", userId).get(),
    ]);
    const user = userDoc.data();
    if (
      !user ||
      user.organizationId !== actor.organizationId ||
      !receivesReminders(user)
    ) {
      summary.skipped += 1;
      continue;
    }
    const missing = findMissingWeeks(
      String(user.reportingStartDate ?? user.employmentStartDate ?? today),
      today,
      sheets.docs.map((doc) => toReportedWeek(doc.data())),
      { employmentEndDate: user.employmentEndDate ?? null, includeCurrentWeek },
    );
    if (!missing.length) {
      summary.skipped += 1;
      continue;
    }
    try {
      const sent = await deliverReminder({
        organizationId: actor.organizationId,
        userId,
        user,
        settings,
        reminderTemplate: templatesDoc.data()?.timeReportReminder,
        organizationName: String(organizationDoc.data()?.name ?? "Debageri"),
        portalUrl: resolvePortalUrl(request.headers),
        today,
        missing,
        sentBy: actor.id,
        sentByRole: actor.role,
      });
      if (sent) summary.sent += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.failed += 1;
      summary.error ||=
        error instanceof Error
          ? `The reminder could not be sent: ${error.message}`
          : "The reminder could not be sent.";
    }
  }
  return NextResponse.json(summary);
}
