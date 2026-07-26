import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";

export default async function ApprovalsPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  let query = db
    .collection("timesheets")
    .where("organizationId", "==", actor.organizationId)
    .where("status", "==", "submitted");
  if (actor.role === "manager")
    query = query.where("managerId", "==", actor.id);
  const sheets = await query.get();
  const userIds = [
    ...new Set(sheets.docs.map((doc) => String(doc.data().userId))),
  ];
  const users = new Map<string, FirebaseFirestore.DocumentData>();
  await Promise.all(
    userIds.map(async (id) => {
      const doc = await db.collection("users").doc(id).get();
      if (doc.exists) users.set(id, doc.data()!);
    }),
  );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Approvals</div>
          <h1>Submitted timesheets</h1>
          <p className="muted page-description">
            Review completed weeks, confirm reported hours and return anything
            that needs correction.
          </p>
        </div>
      </div>
      <section className="card table-wrap">
        {sheets.empty ? (
          <p>No timesheets are waiting for approval.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Week</th>
                <th>Period</th>
                <th>Expected</th>
                <th>Reported</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sheets.docs.map((doc) => {
                const sheet = doc.data();
                const user = users.get(String(sheet.userId));
                return (
                  <tr key={doc.id}>
                    <td>
                      {String(user?.displayName ?? user?.email ?? sheet.userId)}
                    </td>
                    <td>
                      {sheet.isoYear}-W{String(sheet.isoWeek).padStart(2, "0")}
                      {Number(sheet.partCount ?? 1) > 1
                        ? `-${String(sheet.part ?? 1).padStart(2, "0")}`
                        : ""}
                    </td>
                    <td>
                      {sheet.periodStart} to {sheet.periodEnd}
                    </td>
                    <td>{formatDuration(sheet.expectedMinutes)}</td>
                    <td>{formatDuration(sheet.reportedMinutes)}</td>
                    <td>
                      <Link
                        className="button secondary"
                        href={`/manager/approvals/${encodeURIComponent(doc.id)}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
