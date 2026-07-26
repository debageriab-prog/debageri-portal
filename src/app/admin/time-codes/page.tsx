import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
export default async function TimeCodesPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("timeCodes")
    .where("organizationId", "==", user.organizationId)
    .get();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Time codes</h1>
        </div>
      </div>
      <section className="card table-wrap">
        {snapshot.empty ? (
          <p>No time codes are configured.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.docs.map((doc) => {
                const code = doc.data();
                return (
                  <tr key={doc.id}>
                    <td>{code.code}</td>
                    <td>{code.name?.en ?? code.name?.sv}</td>
                    <td>{code.category}</td>
                    <td>{code.active ? "Active" : "Inactive"}</td>
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
