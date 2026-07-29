import { notFound, redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import { ReviewActions } from "./ReviewActions";
import { getTranslator } from "@/lib/localization/server";
import { aggregateReportedBreakdown } from "@/domain/reports/aggregate";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { id } = await params;
  const { db } = getAdminServices();
  const sheetDoc = await db.collection("timesheets").doc(id).get();
  if (!sheetDoc.exists) notFound();
  const sheet = sheetDoc.data()!;
  const [userDoc, entries] = await Promise.all([
    db.collection("users").doc(String(sheet.userId)).get(),
    db.collection("timeEntries").where("timesheetId", "==", id).get(),
  ]);
  const user = userDoc.data();
  const consultant = ["employee", "consultant"].includes(String(user?.role));
  const allowed =
    sheet.organizationId === actor.organizationId &&
    (actor.role === "manager"
      ? consultant
      : consultant || (user?.role === "manager" && user?.reportsTime === true));
  if (!allowed) redirect("/unauthorized");
  const reportedBreakdown = aggregateReportedBreakdown(
    entries.docs.map((entryDoc) => entryDoc.data()),
    t("worked"),
  );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            {t("week")} {sheet.isoWeek}
            {Number(sheet.partCount ?? 1) > 1
              ? `-${String(sheet.part ?? 1).padStart(2, "0")}`
              : ""}
          </div>
          <h1>{String(user?.displayName ?? user?.email ?? sheet.userId)}</h1>
          <p className="muted">
            {sheet.periodStart} to {sheet.periodEnd}
          </p>
          <p className="muted page-description">{t("reviewDescription")}</p>
        </div>
        <span className="status">{sheet.status}</span>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>{t("reportedTime")}</h2>
          {entries.empty ? (
            <p>{t("noTimeEntries")}</p>
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
          <h2>{t("summary")}</h2>
          <p>
            {t("expected")}{" "}
            <strong style={{ float: "right" }}>
              {formatDuration(sheet.expectedMinutes)}
            </strong>
          </p>
          <div className="approval-summary-section">
            <strong>{t("reported")}</strong>
            <div className="reported-breakdown">
              {reportedBreakdown.map((item) => (
                <span key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatDuration(item.minutes)}</strong>
                </span>
              ))}
            </div>
          </div>
          {sheet.status === "submitted" ? (
            <ReviewActions id={id} />
          ) : (
            <p>{t("alreadyReviewed")}</p>
          )}
        </aside>
      </div>
    </>
  );
}
