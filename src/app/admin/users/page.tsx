import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { EmployeeForm } from "./EmployeeForm";

export default async function UsersPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const users = snapshot.docs.map((doc) => ({
    id: doc.id,
    displayName: String(doc.data().displayName),
    email: String(doc.data().email),
    employeeNumber: String(doc.data().employeeNumber),
    role: String(doc.data().role),
    status: String(doc.data().status),
  }));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Employees</h1>
          <p className="muted page-description">
            Add team members, review their access and see who can use the
            employee portal.
          </p>
        </div>
        <EmployeeForm />
      </div>
      <section className="card table-wrap">
        {users.length === 0 ? (
          <p>No employees have been added.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Number</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{user.employeeNumber}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
