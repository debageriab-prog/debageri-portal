import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import { getTranslator } from "@/lib/localization/server";
import { dateRangeLabel } from "@/lib/localization/timesheets";
import { aggregateReportedBreakdown } from "@/domain/reports/aggregate";
import { vacationMinutesIn } from "@/components/vacation/VacationOverviewCard";
import { reportVisibleTo } from "@/domain/reports/time-report-export";
import { reachOf, reachesUser } from "@/server/auth/reach";

export default async function ApprovalsPage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const query = db
    .collection("timesheets")
    .where("organizationId", "==", actor.organizationId)
    .where("status", "==", "submitted");
  const [sheets, reach] = await Promise.all([query.get(), reachOf(db, actor)]);
  const userIds = [
    ...new Set(sheets.docs.map((doc) => String(doc.data().userId))),
  ].filter((id) => reachesUser(reach, id));
  const users = new Map<string, FirebaseFirestore.DocumentData>();
  await Promise.all(
    userIds.map(async (id) => {
      const doc = await db.collection("users").doc(id).get();
      if (doc.exists) users.set(id, doc.data()!);
    }),
  );
  const visibleSheets = sheets.docs.filter((doc) => {
    const userId = String(doc.data().userId);
    const user = users.get(userId);
    return (
      Boolean(user) &&
      reportVisibleTo(
        actor.role,
        { id: userId, role: user?.role, reportsTime: user?.reportsTime },
        reach,
      )
    );
  });
  const vacationSheets = new Set<string>();
  const reportedBreakdowns = new Map<
    string,
    Array<{ label: string; minutes: number }>
  >();
  await Promise.all(
    visibleSheets.map(async (sheetDoc) => {
      const entrySnapshot = await db
        .collection("timeEntries")
        .where("timesheetId", "==", sheetDoc.id)
        .get();
      const entryData = entrySnapshot.docs.map((entryDoc) => entryDoc.data());
      if (vacationMinutesIn(entryData) > 0) vacationSheets.add(sheetDoc.id);
      reportedBreakdowns.set(
        sheetDoc.id,
        aggregateReportedBreakdown(entryData, t("worked")),
      );
    }),
  );
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("approvals")}</div>
          <h1>{t("submittedTimesheets")}</h1>
          <p className="muted page-description">{t("approvalsDescription")}</p>
        </div>
      </div>
      <section className="card table-wrap">
        {visibleSheets.length === 0 ? (
          <p>{t("noPendingTimesheets")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("employee")}</th>
                <th>{t("week")}</th>
                <th>{t("period")}</th>
                <th>{t("expected")}</th>
                <th>{t("reported")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleSheets.map((doc) => {
                const sheet = doc.data();
                const user = users.get(String(sheet.userId));
                return (
                  <tr key={doc.id}>
                    <td>
                      {String(user?.displayName ?? user?.email ?? sheet.userId)}
                      {vacationSheets.has(doc.id) && (
                        <>
                          {" "}
                          <span className="status status-vacation">
                            {t("vacationIncluded")}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {sheet.isoYear}-W{String(sheet.isoWeek).padStart(2, "0")}
                      {Number(sheet.partCount ?? 1) > 1
                        ? `-${String(sheet.part ?? 1).padStart(2, "0")}`
                        : ""}
                    </td>
                    <td>
                      {dateRangeLabel(t, sheet.periodStart, sheet.periodEnd)}
                    </td>
                    <td>{formatDuration(sheet.expectedMinutes)}</td>
                    <td>
                      <div className="reported-breakdown">
                        {(reportedBreakdowns.get(doc.id) ?? []).map((item) => (
                          <span key={item.label}>
                            <span>{item.label}</span>{" "}
                            <strong>{formatDuration(item.minutes)}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link
                        className="button secondary"
                        href={`/manager/approvals/${encodeURIComponent(doc.id)}`}
                      >
                        {t("review")}
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
