import { notFound, redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import { ReviewActions } from "@/app/manager/approvals/[id]/ReviewActions";

export default async function TimeReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const { db } = getAdminServices();
  const sheetDoc = await db.collection("timesheets").doc(id).get();
  if (!sheetDoc.exists) notFound();
  const sheet = sheetDoc.data()!;
  if (sheet.organizationId !== actor.organizationId) redirect("/unauthorized");
  const [userDoc, entries] = await Promise.all([
    db.collection("users").doc(String(sheet.userId)).get(),
    db.collection("timeEntries").where("timesheetId", "==", id).get(),
  ]);
  if (!userDoc.exists) notFound();
  const user = userDoc.data()!;
  const consultant = ["employee", "consultant"].includes(String(user.role));
  const adminVisible =
    consultant || (user.role === "manager" && user.reportsTime === true);
  if (
    (actor.role === "accountant" && !consultant) ||
    (actor.role === "manager" && !consultant) ||
    (actor.role === "admin" && !adminVisible)
  )
    redirect("/unauthorized");
  const canAct = ["manager", "admin"].includes(actor.role);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Time report</div>
          <h1>{String(user.displayName ?? user.email)}</h1>
          <p className="muted">
            {sheet.periodStart} to {sheet.periodEnd}
          </p>
        </div>
        <span className={`status status-${sheet.status}`}>{sheet.status}</span>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Reported time</h2>
          {entries.empty ? (
            <p>No time entries.</p>
          ) : (
            entries.docs
              .sort((a, b) =>
                String(a.data().date).localeCompare(String(b.data().date)),
              )
              .map((doc) => {
                const entry = doc.data();
                return (
                  <p key={doc.id}>
                    {entry.date} · {entry.timeCodeSnapshot?.code} ·{" "}
                    {formatDuration(entry.minutes)}
                  </p>
                );
              })
          )}
        </section>
        <aside className="card">
          <h2>Summary</h2>
          <p>Expected: {formatDuration(sheet.expectedMinutes)}</p>
          <p>Reported: {formatDuration(sheet.reportedMinutes)}</p>
          <p>Worked: {formatDuration(sheet.workedMinutes)}</p>
          {canAct && sheet.status === "submitted" ? (
            <ReviewActions id={id} returnTo="/time-reports" />
          ) : (
            <p className="muted">
              {actor.role === "accountant"
                ? "This view is read-only."
                : "This report is not waiting for approval."}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
