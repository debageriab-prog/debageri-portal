import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { formatDuration } from "@/lib/durations/duration";
export default async function EmploymentTermsPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const [termsSnapshot, usersSnapshot] = await Promise.all([
    db
      .collection("employmentTerms")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const users = new Map(usersSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Employment terms</h1>
          <p className="muted page-description">
            Review working hours and effective dates used to calculate each
            employee&apos;s expected time.
          </p>
        </div>
      </div>
      <section className="card table-wrap">
        {termsSnapshot.empty ? (
          <p>No employment terms.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Valid from</th>
                <th>Valid to</th>
                <th>Weekly hours</th>
              </tr>
            </thead>
            <tbody>
              {termsSnapshot.docs.map((doc) => {
                const term = doc.data();
                return (
                  <tr key={doc.id}>
                    <td>
                      {String(
                        users.get(term.userId)?.displayName ?? term.userId,
                      )}
                    </td>
                    <td>{term.validFrom}</td>
                    <td>{term.validTo ?? "—"}</td>
                    <td>{formatDuration(term.weeklyMinutes)}</td>
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
