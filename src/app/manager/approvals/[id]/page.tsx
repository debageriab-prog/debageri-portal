import { notFound, redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import { ReviewActions } from "./ReviewActions";

export default async function ReviewPage({
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
  if (
    sheet.organizationId !== actor.organizationId ||
    (actor.role === "manager" && sheet.managerId !== actor.id)
  )
    redirect("/unauthorized");
  const [userDoc, entries] = await Promise.all([
    db.collection("users").doc(String(sheet.userId)).get(),
    db.collection("timeEntries").where("timesheetId", "==", id).get(),
  ]);
  const user = userDoc.data();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Week {sheet.isoWeek}</div>
          <h1>{String(user?.displayName ?? user?.email ?? sheet.userId)}</h1>
          <p className="muted">
            {sheet.periodStart} – {sheet.periodEnd}
          </p>
          <p className="muted page-description">
            Compare the employee&apos;s entries with expected hours, then
            approve the week or return it with a clear reason.
          </p>
        </div>
        <span className="status">{sheet.status}</span>
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
                    {entry.comment ? ` · ${entry.comment}` : ""}
                  </p>
                );
              })
          )}
        </section>
        <aside className="card">
          <h2>Summary</h2>
          <p>
            Expected{" "}
            <strong style={{ float: "right" }}>
              {formatDuration(sheet.expectedMinutes)}
            </strong>
          </p>
          <p>
            Reported{" "}
            <strong style={{ float: "right" }}>
              {formatDuration(sheet.reportedMinutes)}
            </strong>
          </p>
          <p>
            Worked{" "}
            <strong style={{ float: "right" }}>
              {formatDuration(sheet.workedMinutes)}
            </strong>
          </p>
          {sheet.status === "submitted" ? (
            <ReviewActions id={id} />
          ) : (
            <p>This timesheet has already been reviewed.</p>
          )}
        </aside>
      </div>
    </>
  );
}
