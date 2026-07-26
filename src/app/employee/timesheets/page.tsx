import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getIsoWeek } from "@/lib/dates/iso-week";
import { HistoryView } from "./HistoryView";

export default async function HistoryPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const [sheetSnapshot, entrySnapshot, termSnapshot, holidaySnapshot] =
    await Promise.all([
      db.collection("timesheets").where("userId", "==", user.id).get(),
      db.collection("timeEntries").where("userId", "==", user.id).get(),
      db.collection("employmentTerms").where("userId", "==", user.id).get(),
      db
        .collection("holidays")
        .where("organizationId", "==", user.organizationId)
        .get(),
    ]);
  const entryTotals = new Map<string, number>();
  const entries = entrySnapshot.docs.map((doc) => {
    const data = doc.data();
    const timesheetId = String(data.timesheetId);
    const minutes = Number(data.minutes ?? 0);
    entryTotals.set(timesheetId, (entryTotals.get(timesheetId) ?? 0) + minutes);
    return {
      timesheetId,
      date: String(data.date),
      minutes,
      code: String(data.timeCodeSnapshot?.code ?? data.timeCodeId),
      countsAsWorkedTime: Boolean(data.timeCodeSnapshot?.countsAsWorkedTime),
    };
  });
  const sheets = sheetSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        isoYear: Number(data.isoYear),
        isoWeek: Number(data.isoWeek),
        periodStart: String(data.periodStart),
        periodEnd: String(data.periodEnd),
        reportedMinutes: entryTotals.get(doc.id) ?? 0,
        expectedMinutes: Number(data.expectedMinutes ?? 0),
        status: String(data.status),
      };
    })
    .sort((a, b) => b.isoYear - a.isoYear || b.isoWeek - a.isoWeek);
  const today = new Date().toISOString().slice(0, 10);
  const current = getIsoWeek(today);
  return (
    <HistoryView
      sheets={sheets}
      entries={entries}
      currentYear={current.isoYear}
      currentWeek={current.isoWeek}
      currentMonth={today.slice(0, 7)}
      terms={termSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          validFrom: String(data.validFrom),
          validTo: data.validTo ? String(data.validTo) : null,
          reportingStartDate: String(data.reportingStartDate ?? data.validFrom),
          schedule: data.schedule as Record<string, number>,
        };
      })}
      holidayDates={holidaySnapshot.docs.map((doc) => String(doc.data().date))}
    />
  );
}
