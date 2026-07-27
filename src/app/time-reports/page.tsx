import { getAdminServices } from "@/lib/firebase/admin";
import { getIsoWeek } from "@/lib/dates/iso-week";
import { verifySession } from "@/server/auth/session";
import { HistoryView } from "@/app/employee/timesheets/HistoryView";

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
    timesheetId: string;
    date: string;
    minutes: number;
    name: string;
    countsAsWorkedTime: boolean;
  }> = [];
  let terms: Array<{
    validFrom: string;
    validTo: string | null;
    reportingStartDate: string;
    schedule: Record<string, number>;
  }> = [];
  let holidayDates: string[] = [];

  if (selected) {
    const [sheetSnapshot, entrySnapshot, termSnapshot, holidaySnapshot] =
      await Promise.all([
        db.collection("timesheets").where("userId", "==", selected.id).get(),
        db.collection("timeEntries").where("userId", "==", selected.id).get(),
        db
          .collection("employmentTerms")
          .where("userId", "==", selected.id)
          .get(),
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
    terms = termSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        validFrom: String(data.validFrom),
        validTo: data.validTo ? String(data.validTo) : null,
        reportingStartDate: String(data.reportingStartDate ?? data.validFrom),
        schedule: data.schedule as Record<string, number>,
      };
    });
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
        <form className="report-user-filter">
          <label>
            {actor.role === "admin"
              ? "Consultant or reporting manager"
              : "Consultant"}
            <select className="field" name="userId" defaultValue={userId ?? ""}>
              <option value="" disabled>
                Select a consultant
              </option>
              {users.map((user) => (
                <option value={user.id} key={user.id}>
                  {String(user.displayName)}
                </option>
              ))}
            </select>
          </label>
          <button className="button">Show time reports</button>
        </form>
      </section>
      {selected && (
        <HistoryView
          sheets={sheets}
          entries={entries}
          currentYear={current.isoYear}
          currentWeek={current.isoWeek}
          currentMonth={today.slice(0, 7)}
          terms={terms}
          holidayDates={holidayDates}
          readOnly
          title={String(selected.displayName)}
          description="View reported hours by week or month. Open a report to inspect its daily entries."
        />
      )}
    </>
  );
}
