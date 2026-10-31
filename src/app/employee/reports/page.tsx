import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
import { getTranslator } from "@/lib/localization/server";

export default async function ReportsPage() {
  const user = (await verifySession())!;
  const t = await getTranslator();
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
          <div className="eyebrow">{t("myReportsEyebrow")}</div>
          <h1>{t("myReportedTime")}</h1>
          <p className="muted page-description">
            {t("myReportedTimeDescription")}
          </p>
        </div>
      </div>
      <section className="card table-wrap">
        {totals.size === 0 ? (
          <p>{t("noReportedTime")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("code")}</th>
                <th>{t("time")}</th>
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
