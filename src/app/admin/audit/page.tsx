import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getTranslator } from "@/lib/localization/server";
export default async function AuditPage() {
  const user = (await verifySession())!;
  const t = await getTranslator();
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
          entityType?: string;
          entityId?: string;
        },
    )
    .sort(
      (a, b) =>
        Number(b.timestamp?.toMillis?.() ?? 0) -
        Number(a.timestamp?.toMillis?.() ?? 0),
    );
  const userIds = [
    ...new Set(
      logs.flatMap((log) => [
        ...(log.actorUserId ? [log.actorUserId] : []),
        ...(log.entityType === "user" && log.entityId ? [log.entityId] : []),
      ]),
    ),
  ];
  const timesheetIds = [
    ...new Set(
      logs
        .filter((log) => log.entityType === "timesheet" && log.entityId)
        .map((log) => log.entityId!),
    ),
  ];
  const [userDocs, timesheetDocs] = await Promise.all([
    userIds.length
      ? db.getAll(...userIds.map((id) => db.collection("users").doc(id)))
      : Promise.resolve([]),
    timesheetIds.length
      ? db.getAll(
          ...timesheetIds.map((id) => db.collection("timesheets").doc(id)),
        )
      : Promise.resolve([]),
  ]);
  const userNames = new Map(
    userDocs.map((doc) => [
      doc.id,
      doc.exists
        ? String(doc.data()?.displayName ?? doc.data()?.email ?? "Unknown user")
        : "Deleted user",
    ]),
  );
  const timesheetNames = new Map(
    timesheetDocs.map((doc) => {
      const data = doc.data();
      const week = data
        ? `Week ${data.isoWeek}${Number(data.partCount ?? 1) > 1 ? `-${String(data.part ?? 1).padStart(2, "0")}` : ""}`
        : "Deleted time report";
      return [doc.id, week];
    }),
  );
  const actionNames: Record<string, string> = {
    "user.created": "Created user",
    "user.updated": "Updated user",
    "user.deleted": "Deleted user",
    "user.password_reset": "Changed user password",
    "timesheet.submitted": "Submitted time report",
    "timesheet.resubmitted": "Resubmitted time report",
    "timesheet.approved": "Approved time report",
    "timesheet.rejected": "Rejected time report",
    "timesheet.reopened": "Reopened time report",
    "timesheet.auto_approved_non_working":
      "Reported non-working period with 0 hours",
  };
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("auditHistory")}</h1>
          <p className="muted page-description">{t("auditPageDescription")}</p>
        </div>
      </div>
      <section className="card table-wrap">
        {logs.length === 0 ? (
          <p>{t("noAuditEvents")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("time")}</th>
                <th>{t("actor")}</th>
                <th>{t("event")}</th>
                <th>{t("entity")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.timestamp?.toDate?.().toISOString() ?? ""}</td>
                  <td>{userNames.get(String(log.actorUserId)) ?? "System"}</td>
                  <td>
                    {actionNames[String(log.action)] ??
                      String(log.action).replaceAll(".", " ")}
                  </td>
                  <td>
                    {log.entityType === "user"
                      ? userNames.get(String(log.entityId))
                      : log.entityType === "timesheet"
                        ? timesheetNames.get(String(log.entityId))
                        : String(log.entityId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
