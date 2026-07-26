import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import type { Timesheet } from "@/domain/types";

export default async function HistoryPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("timesheets")
    .where("userId", "==", user.id)
    .get();
  const sheets = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Timesheet)
    .sort(
      (a, b) =>
        Number(b.isoYear) - Number(a.isoYear) ||
        Number(b.isoWeek) - Number(a.isoWeek),
    );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time reporting</div>
          <h1>History</h1>
        </div>
      </div>
      <section className="card table-wrap">
        {sheets.length === 0 ? (
          <p>No timesheets yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Period</th>
                <th>Reported</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet) => (
                <tr key={sheet.id}>
                  <td>
                    {sheet.isoYear}-W{String(sheet.isoWeek).padStart(2, "0")}
                  </td>
                  <td>
                    {String(sheet.periodStart)} – {String(sheet.periodEnd)}
                  </td>
                  <td>{formatDuration(Number(sheet.reportedMinutes))}</td>
                  <td>{String(sheet.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
