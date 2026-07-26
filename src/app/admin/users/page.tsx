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
    .map((doc) => ({
      id: doc.id,
      displayName: String(doc.data().displayName),
      email: String(doc.data().email),
      employeeNumber: String(doc.data().employeeNumber),
      role: String(doc.data().role),
      status: String(doc.data().status),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return <UserManagement users={users} currentUserId={actor.id} />;
}
