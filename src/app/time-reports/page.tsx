import { getAdminServices } from "@/lib/firebase/admin";
import { getIsoWeek } from "@/lib/dates/iso-week";
import { verifySession } from "@/server/auth/session";
import { HistoryView } from "@/app/employee/timesheets/HistoryView";
import { ConsultantDashboard } from "./ConsultantDashboard";
import { ConsultantSelect } from "./ConsultantSelect";

function visibleUser(actorRole: string, user: FirebaseFirestore.DocumentData) {
  const role = String(user.role);
  if (["employee", "consultant"].includes(role)) return true;
  return (
    actorRole === "admin" && role === "manager" && user.reportsTime === true
  );
}

export default async function TimeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const actor = (await verifySession())!;
  const { userId } = await searchParams;
  const { db } = getAdminServices();
  const usersSnapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const users = usersSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: String(data.displayName ?? data.email),
        role: String(data.role),
        reportsTime: data.reportsTime === true,
        reportingStartDate: data.reportingStartDate
          ? String(data.reportingStartDate)
          : data.employmentStartDate
            ? String(data.employmentStartDate)
            : null,
        employmentEndDate: data.employmentEndDate
          ? String(data.employmentEndDate)
          : null,
      };
    })
    .filter((user) => visibleUser(actor.role, user))
    .sort((left, right) =>
      String(left.displayName).localeCompare(String(right.displayName)),
    );
  const selected = users.find((user) => user.id === userId);

  let sheets: Array<{
    id: string;
    isoYear: number;
    isoWeek: number;
    part: number;
    partCount: number;
    periodStart: string;
    periodEnd: string;
    reportedMinutes: number;
    expectedMinutes: number;
    status: string;
  }> = [];
  let entries: Array<{
    userId: string;
    timesheetId: string;
    date: string;
    minutes: number;
    name: string;
    countsAsWorkedTime: boolean;
  }> = [];
  let holidayDates: string[] = [];

  if (selected) {
    const [sheetSnapshot, entrySnapshot, holidaySnapshot] = await Promise.all([
      db.collection("timesheets").where("userId", "==", selected.id).get(),
      db.collection("timeEntries").where("userId", "==", selected.id).get(),
      db
        .collection("holidays")
        .where("organizationId", "==", actor.organizationId)
        .get(),
    ]);
    const totals = new Map<string, number>();
    entries = entrySnapshot.docs.map((doc) => {
      const data = doc.data();
      const timesheetId = String(data.timesheetId);
      const minutes = Number(data.minutes ?? 0);
      totals.set(timesheetId, (totals.get(timesheetId) ?? 0) + minutes);
      return {
        userId: selected.id,
        timesheetId,
        date: String(data.date),
        minutes,
        name: String(
          data.timeCodeSnapshot?.name ??
            data.timeCodeSnapshot?.code ??
            data.timeCodeId,
        ),
        countsAsWorkedTime: Boolean(data.timeCodeSnapshot?.countsAsWorkedTime),
      };
    });
    sheets = sheetSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          isoYear: Number(data.isoYear),
          isoWeek: Number(data.isoWeek),
          part: Number(data.part ?? 1),
          partCount: Number(data.partCount ?? 1),
          periodStart: String(data.periodStart),
          periodEnd: String(data.periodEnd),
          reportedMinutes: totals.get(doc.id) ?? 0,
          expectedMinutes: Number(data.expectedMinutes ?? 0),
          status: String(data.status),
        };
      })
      .sort(
        (a, b) =>
          b.isoYear - a.isoYear || b.isoWeek - a.isoWeek || b.part - a.part,
      );
    holidayDates = holidaySnapshot.docs.map((doc) => String(doc.data().date));
  } else {
    const [entrySnapshot, holidaySnapshot] = await Promise.all([
      db
        .collection("timeEntries")
        .where("organizationId", "==", actor.organizationId)
        .get(),
      db
        .collection("holidays")
        .where("organizationId", "==", actor.organizationId)
        .get(),
    ]);
    const visibleIds = new Set(users.map((user) => user.id));
    entries = entrySnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          userId: String(data.userId),
          timesheetId: String(data.timesheetId),
          date: String(data.date),
          minutes: Number(data.minutes ?? 0),
          name: String(
            data.timeCodeSnapshot?.name ??
              data.timeCodeSnapshot?.code ??
              data.timeCodeId,
          ),
          countsAsWorkedTime: Boolean(
            data.timeCodeSnapshot?.countsAsWorkedTime,
          ),
        };
      })
      .filter((entry) => visibleIds.has(entry.userId));
    holidayDates = holidaySnapshot.docs.map((doc) => String(doc.data().date));
  }

  const today = new Date().toISOString().slice(0, 10);
  const current = getIsoWeek(today);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time reports</div>
          <h1>Employee time reports</h1>
          <p className="muted page-description">
            Select a consultant to explore their latest, monthly, or weekly
            reports. This reporting view is read-only.
          </p>
        </div>
      </div>
      <section className="card">
        <div className="report-user-filter">
          <ConsultantSelect
            users={users}
            selectedUserId={selected?.id}
            label={
              actor.role === "admin"
                ? "Consultant or reporting manager"
                : "Consultant"
            }
          />
        </div>
      </section>
      {!selected && (
        <ConsultantDashboard
          consultants={users}
          entries={entries}
          holidayDates={holidayDates}
          currentYear={current.isoYear}
          currentWeek={current.isoWeek}
          currentMonth={today.slice(0, 7)}
        />
      )}
      {selected && (
        <HistoryView
          sheets={sheets}
          entries={entries}
          currentYear={current.isoYear}
          currentWeek={current.isoWeek}
          currentMonth={today.slice(0, 7)}
          reportingStartDate={selected.reportingStartDate}
          employmentEndDate={selected.employmentEndDate}
          holidayDates={holidayDates}
          readOnly
          initialMode="month"
          avatarUserId={selected.id}
          title={String(selected.displayName)}
          description="View reported hours by week or month. Open a report to inspect its daily entries."
        />
      )}
    </>
  );
}
