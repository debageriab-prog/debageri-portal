import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { UserManagement } from "./UserManagement";

export default async function UsersPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const users = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: String(data.displayName),
        email: String(data.email),
        employeeNumber: String(data.employeeNumber),
        role: String(data.role),
        reportsTime:
          data.reportsTime ??
          ["employee", "consultant"].includes(String(data.role)),
        status: String(data.status),
        createdAt: data.createdAt?.toMillis?.() ?? 0,
        employmentStartDate: String(data.employmentStartDate ?? ""),
        employmentEndDate: String(data.employmentEndDate ?? ""),
        reportingStartDate: String(data.reportingStartDate ?? ""),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return <UserManagement users={users} currentUserId={actor.id} />;
}
