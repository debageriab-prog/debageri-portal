import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";

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
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as {
        displayName: string;
        role: string;
        reportsTime?: boolean;
      }),
    }))
    .filter((user) => visibleUser(actor.role, user))
    .sort((left, right) =>
      String(left.displayName).localeCompare(String(right.displayName)),
    );
  const selected = users.find((user) => user.id === userId);
  const sheets = selected
    ? await db.collection("timesheets").where("userId", "==", selected.id).get()
    : null;
  const rows =
    sheets?.docs.sort((left, right) =>
      String(right.data().periodStart).localeCompare(
        String(left.data().periodStart),
      ),
    ) ?? [];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time reports</div>
          <h1>Employee time reports</h1>
          <p className="muted page-description">
            Select a consultant to review their submitted and historical time
            reports. Accountants have read-only access.
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
        <section className="card table-wrap">
          <h2>{String(selected.displayName)}</h2>
          {rows.length === 0 ? (
            <p>No time reports have been submitted.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Reported</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => {
                  const sheet = doc.data();
                  return (
                    <tr key={doc.id}>
                      <td>
                        {sheet.isoYear}-W
                        {String(sheet.isoWeek).padStart(2, "0")}
                      </td>
                      <td>
                        {sheet.periodStart} to {sheet.periodEnd}
                      </td>
                      <td>
                        <span className={`status status-${sheet.status}`}>
                          {sheet.status}
                        </span>
                      </td>
                      <td>{formatDuration(sheet.reportedMinutes)}</td>
                      <td>
                        <Link
                          className="button secondary"
                          href={`/time-reports/${encodeURIComponent(doc.id)}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
