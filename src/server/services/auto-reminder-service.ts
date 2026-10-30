import "server-only";

import {
  findMissingWeeks,
  receivesReminders,
  toReportedWeek,
} from "@/domain/reminders/missing-weeks";
import {
  dueAutoReminders,
  EVENING_REMINDER_HOUR,
  normalizeAutoReminders,
} from "@/domain/reminders/schedule";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getAdminServices } from "@/lib/firebase/admin";
import { deliverReminder } from "@/server/services/reminder-service";

export const AUTO_REMINDER_SENDER = "system";

/**
 * Sends the automatic reminders due at this moment. Each run has its own event
 * id per consultant, so a repeated scheduler call sends nothing twice, and a
 * manual reminder the same day replaces the automatic one.
 */
export async function runAutoReminders(portalUrl: string, now = new Date()) {
  const { date, hour } = stockholmDateTime(now);
  const { db } = getAdminServices();
  const [settingsDocs, sentToday] = await Promise.all([
    db.collection("reminderSettings").get(),
    db.collection("reminderEvents").where("sentDate", "==", date).get(),
  ]);
  const remindedManually = new Set(
    sentToday.docs
      .filter((doc) => doc.data().sentBy !== AUTO_REMINDER_SENDER)
      .map((doc) => String(doc.data().userId)),
  );
  const summary = { sent: 0, failed: 0 };

  for (const settingsDoc of settingsDocs.docs) {
    const settings = settingsDoc.data();
    const organizationId = settingsDoc.id;
    const autoReminders = normalizeAutoReminders(settings.autoReminders);
    if (
      !settings.encryptedPassword ||
      !Object.values(autoReminders).some(Boolean)
    )
      continue;
    const holidayDocs = await db
      .collection("holidays")
      .where("organizationId", "==", organizationId)
      .get();
    const holidays = new Set(
      holidayDocs.docs.map((doc) => String(doc.data().date)),
    );
    if (!dueAutoReminders(autoReminders, date, hour, holidays).length) continue;

    const [users, sheets, templatesDoc, organizationDoc] = await Promise.all([
      db
        .collection("users")
        .where("organizationId", "==", organizationId)
        .get(),
      db
        .collection("timesheets")
        .where("organizationId", "==", organizationId)
        .get(),
      db.collection("emailTemplates").doc(organizationId).get(),
      db.collection("organizations").doc(organizationId).get(),
    ]);

    for (const userDoc of users.docs) {
      const user = userDoc.data();
      const reportingStart =
        user.reportingStartDate ?? user.employmentStartDate;
      if (
        !receivesReminders(user) ||
        !reportingStart ||
        (user.employmentEndDate && user.employmentEndDate < date) ||
        remindedManually.has(userDoc.id)
      )
        continue;
      const missing = findMissingWeeks(
        String(reportingStart),
        date,
        sheets.docs
          .filter((sheet) => sheet.data().userId === userDoc.id)
          .map((sheet) => toReportedWeek(sheet.data())),
        {
          employmentEndDate: user.employmentEndDate ?? null,
          includeCurrentWeek: hour === EVENING_REMINDER_HOUR,
        },
      );
      if (!missing.length) continue;
      try {
        const sent = await deliverReminder({
          reminderId: `${organizationId}_${userDoc.id}_${date}_auto-${hour}`,
          organizationId,
          userId: userDoc.id,
          user,
          settings,
          reminderTemplate: templatesDoc.data()?.timeReportReminder,
          organizationName: String(organizationDoc.data()?.name ?? "Debageri"),
          portalUrl,
          today: date,
          missing,
          sentBy: AUTO_REMINDER_SENDER,
          sentByRole: AUTO_REMINDER_SENDER,
        });
        if (sent) summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        console.error("Automatic reminder failed", userDoc.id, error);
      }
    }
  }
  return summary;
}
