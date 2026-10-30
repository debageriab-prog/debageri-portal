import "server-only";

import {
  findMissingWeeks,
  receivesReminders,
  toReportedWeek,
} from "@/domain/reminders/missing-weeks";
import {
  countsCurrentWeek,
  dueAutoReminders,
  normalizeAutoReminders,
} from "@/domain/reminders/schedule";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getAdminServices } from "@/lib/firebase/admin";
import { deliverReminder } from "@/server/services/reminder-service";

export const AUTO_REMINDER_SENDER = "system";

/**
 * Sends the automatic reminders due at this moment. A consultant gets at most
 * one reminder a day, so repeated scheduler calls and consultants already
 * reminded today are skipped.
 */
export async function runAutoReminders(portalUrl: string, now = new Date()) {
  const { date, hour } = stockholmDateTime(now);
  const { db } = getAdminServices();
  const settingsDocs = await db.collection("reminderSettings").get();
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
        (user.employmentEndDate && user.employmentEndDate < date)
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
          includeCurrentWeek: countsCurrentWeek(date, holidays),
        },
      );
      if (!missing.length) continue;
      try {
        const sent = await deliverReminder({
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
