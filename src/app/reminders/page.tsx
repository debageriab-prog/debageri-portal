import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
import { findMissingWeeks } from "@/domain/reminders/missing-weeks";
import { ReminderPanel } from "./ReminderPanel";
import { ReminderSelect } from "./ReminderSelect";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { userId } = await searchParams;
  const { db } = getAdminServices();
  const [usersSnapshot, settingsDoc] = await Promise.all([
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db.collection("reminderSettings").doc(actor.organizationId).get(),
  ]);
  const users = usersSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        role: String(data.role),
        displayName: String(data.displayName ?? data.email),
        email: String(data.email),
        reportingStartDate: String(
          data.reportingStartDate ?? data.employmentStartDate ?? "",
        ),
      };
    })
    .filter((user) => ["employee", "consultant"].includes(String(user.role)))
    .map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      reportingStartDate: user.reportingStartDate,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const selected = users.find((user) => user.id === userId);
  const today = new Date().toISOString().slice(0, 10);
  let missing: Array<{ isoYear: number; isoWeek: number }> = [];
  let latestReport: {
    isoYear: number;
    isoWeek: number;
    status: string;
  } | null = null;
  let alreadySentToday = false;
  let latestReminder: { sentDate: string; sentByRole: string } | null = null;

  if (selected) {
    const [sheets, reminders] = await Promise.all([
      db.collection("timesheets").where("userId", "==", selected.id).get(),
      db.collection("reminderEvents").where("userId", "==", selected.id).get(),
    ]);
    const reports = sheets.docs
      .map((doc) => ({
        isoYear: Number(doc.data().isoYear),
        isoWeek: Number(doc.data().isoWeek),
        status: String(doc.data().status),
      }))
      .sort((a, b) => b.isoYear - a.isoYear || b.isoWeek - a.isoWeek);
    latestReport = reports[0] ?? null;
    missing = findMissingWeeks(
      selected.reportingStartDate || today,
      today,
      reports,
    );
    const sent = reminders.docs
      .map((doc) => ({
        sentDate: String(doc.data().sentDate),
        sentByRole: String(doc.data().sentByRole),
      }))
      .sort((a, b) => b.sentDate.localeCompare(a.sentDate));
    latestReminder = sent[0] ?? null;
    alreadySentToday = sent.some((item) => item.sentDate === today);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("reminders")}</div>
          <h1>{t("timeReportReminders")}</h1>
          <p className="muted page-description">{t("remindersDescription")}</p>
        </div>
      </div>
      <section className="card reminder-selection">
        <ReminderSelect users={users} selectedUserId={selected?.id} />
      </section>
      {selected && (
        <div className="grid-2">
          <section className="card">
            <h2>{selected.displayName}</h2>
            <p>{selected.email}</p>
            <p>
              <strong>{t("latestReport")}:</strong>{" "}
              {latestReport
                ? `${latestReport.isoYear}-W${String(latestReport.isoWeek).padStart(2, "0")} (${latestReport.status})`
                : t("noReports")}
            </p>
            <p>
              <strong>{t("latestReminder")}:</strong>{" "}
              {latestReminder
                ? `${latestReminder.sentDate} (${latestReminder.sentByRole})`
                : t("never")}
            </p>
          </section>
          <section className="card">
            <h2>{t("missingWeeks")}</h2>
            {missing.length ? (
              <ul>
                {missing.map((week) => (
                  <li key={`${week.isoYear}-${week.isoWeek}`}>
                    {week.isoYear}-W{String(week.isoWeek).padStart(2, "0")}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("noMissingWeeks")}</p>
            )}
            <ReminderPanel
              selectedUserId={selected.id}
              settingsConfigured={Boolean(
                settingsDoc.data()?.encryptedPassword,
              )}
              alreadySentToday={alreadySentToday}
            />
          </section>
        </div>
      )}
    </>
  );
}
