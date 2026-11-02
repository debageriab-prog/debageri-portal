import { getAdminServices } from "@/lib/firebase/admin";
import { can } from "@/domain/access/permissions";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { permissionResolver } from "@/server/auth/permissions";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import {
  findMissingWeeks,
  listedInReminderOverview,
  receivesReminders,
  toReportedWeek,
} from "@/domain/reminders/missing-weeks";
import {
  countsCurrentWeek,
  normalizeAutoReminders,
} from "@/domain/reminders/schedule";
import { AutoReminderForm } from "./AutoReminderForm";
import { ReminderOverview, type ReminderRow } from "./ReminderOverview";
import { RemindersTabs } from "./RemindersTabs";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { tab } = await searchParams;
  const { db } = getAdminServices();
  const permissionsFor = await permissionResolver(db, actor.organizationId);
  const [
    usersSnapshot,
    settingsDoc,
    sheetsSnapshot,
    remindersSnapshot,
    holidaysSnapshot,
  ] = await Promise.all([
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db.collection("reminderSettings").doc(actor.organizationId).get(),
    db
      .collection("timesheets")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("reminderEvents")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("holidays")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const today = stockholmDateTime().date;
  const includeCurrentWeek = countsCurrentWeek(
    today,
    new Set(holidaysSnapshot.docs.map((doc) => String(doc.data().date))),
  );
  const sheets = sheetsSnapshot.docs.map((doc) => doc.data());
  const reminders = remindersSnapshot.docs
    .map((doc) => doc.data())
    .map((reminder) => ({
      userId: String(reminder.userId),
      sentDate: String(reminder.sentDate),
      sentByRole: String(reminder.sentByRole),
    }))
    .sort((a, b) => b.sentDate.localeCompare(a.sentDate));
  const rows: ReminderRow[] = usersSnapshot.docs
    .filter((doc) => {
      const data = doc.data();
      return (
        receivesReminders(data) &&
        permissionsFor({
          role: String(data.role),
          organizationId: String(data.organizationId),
          accessProfileId: data.accessProfileId,
          financeAccess: data.financeAccess,
          documentAccess: data.documentAccess,
        }).includes("my.time.report")
      );
    })
    .flatMap((doc) => {
      const data = doc.data();
      const reports = sheets
        .filter((sheet) => sheet.userId === doc.id)
        .map(toReportedWeek)
        .sort((a, b) => b.isoYear - a.isoYear || b.isoWeek - a.isoWeek);
      const sent = reminders.filter((reminder) => reminder.userId === doc.id);
      const missing = findMissingWeeks(
        String(data.reportingStartDate ?? data.employmentStartDate ?? today),
        today,
        reports,
        {
          employmentEndDate: data.employmentEndDate ?? null,
          includeCurrentWeek,
        },
      );
      if (!listedInReminderOverview(data.employmentEndDate, today, missing))
        return [];
      return [
        {
          id: doc.id,
          displayName: String(data.displayName ?? data.email),
          email: String(data.email),
          missing,
          latestReport: reports[0]
            ? {
                isoYear: reports[0].isoYear,
                isoWeek: reports[0].isoWeek,
                status: reports[0].status,
              }
            : null,
          latestReminder: sent[0]
            ? { sentDate: sent[0].sentDate, sentByRole: sent[0].sentByRole }
            : null,
          alreadySentToday: sent.some((item) => item.sentDate === today),
        },
      ];
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const settingsConfigured = Boolean(settingsDoc.data()?.encryptedPassword);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("reminders")}</div>
          <h1>{t("timeReportReminders")}</h1>
          <p className="muted page-description">{t("remindersDescription")}</p>
        </div>
      </div>
      <RemindersTabs
        initialTab={tab === "auto" ? "auto" : "overview"}
        panels={{
          overview: (
            <ReminderOverview
              rows={rows}
              settingsConfigured={settingsConfigured}
              canSend={can(actor, "time.reminders.send")}
            />
          ),
          auto: can(actor, "time.reminders.schedule") ? (
            <AutoReminderForm
              autoReminders={normalizeAutoReminders(
                settingsDoc.data()?.autoReminders,
              )}
              settingsConfigured={settingsConfigured}
            />
          ) : undefined,
        }}
      />
    </>
  );
}
