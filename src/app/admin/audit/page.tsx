import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
export default async function AuditPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("auditLogs")
    .where("organizationId", "==", user.organizationId)
    .get();
  const logs = snapshot.docs
    .map(
      (doc) =>
        ({ id: doc.id, ...doc.data() }) as {
          id: string;
          timestamp?: FirebaseFirestore.Timestamp;
          actorUserId?: string;
          action?: string;
          entityId?: string;
        },
    )
    .sort(
      (a, b) =>
        Number(b.timestamp?.toMillis?.() ?? 0) -
        Number(a.timestamp?.toMillis?.() ?? 0),
    );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Audit history</h1>
        </div>
      </div>
      <section className="card table-wrap">
        {logs.length === 0 ? (
          <p>No audit events yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Event</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.timestamp?.toDate?.().toISOString() ?? ""}</td>
                  <td>{String(log.actorUserId)}</td>
                  <td>{String(log.action)}</td>
                  <td>{String(log.entityId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
