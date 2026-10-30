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
import { deliverReminder } from "@/server/services/reminder-service";

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
    !receivesReminders(user)
  )
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const settings = settingsDoc.data();
  if (!settings?.encryptedPassword)
    return NextResponse.json(
      { error: "Reminder email settings are not configured." },
      { status: 409 },
    );
  const today = stockholmDateTime().date;
  const missing = findMissingWeeks(
    String(user.reportingStartDate ?? user.employmentStartDate ?? today),
    today,
    sheets.docs.map((doc) => toReportedWeek(doc.data())),
    { employmentEndDate: user.employmentEndDate ?? null },
  );
  if (!missing.length)
    return NextResponse.json(
      { error: "This employee has no missing time reports." },
      { status: 409 },
    );

  try {
    const sent = await deliverReminder({
      reminderId: `${actor.organizationId}_${parsed.data.userId}_${today}`,
      organizationId: actor.organizationId,
      userId: parsed.data.userId,
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
    if (!sent)
      return NextResponse.json(
        { error: "A reminder has already been sent to this employee today." },
        { status: 409 },
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
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
