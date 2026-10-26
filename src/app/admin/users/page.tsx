import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { UserManagement } from "./UserManagement";
import { toManagedUser } from "./user-data";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const users = snapshot.docs
    .map(toManagedUser)
    .sort((a, b) => b.createdAt - a.createdAt);
  const saved = (await searchParams).saved;

  return (
    <UserManagement
      users={users}
      currentUserId={actor.id}
      saved={saved === "created" || saved === "updated" ? saved : null}
    />
  );
}
