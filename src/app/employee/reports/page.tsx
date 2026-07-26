import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
export default async function ReportsPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("timeEntries")
    .where("userId", "==", user.id)
    .get();
  const totals = new Map<string, number>();
  snapshot.docs.forEach((doc) => {
    const entry = doc.data();
    const code = String(entry.timeCodeSnapshot?.code ?? entry.timeCodeId);
    totals.set(code, (totals.get(code) ?? 0) + Number(entry.minutes));
  });
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Reports</div>
          <h1>My reported time</h1>
          <p className="muted page-description">
            Understand how your submitted time is distributed across work and
            absence categories.
          </p>
        </div>
      </div>
      <section className="card table-wrap">
        {totals.size === 0 ? (
          <p>No reported time yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {[...totals].map(([code, minutes]) => (
                <tr key={code}>
                  <td>{code}</td>
                  <td>{formatDuration(minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
