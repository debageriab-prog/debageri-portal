import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { listAccessProfiles } from "@/server/services/access-profile-service";
import { UserManagement } from "./UserManagement";
import { toManagedUser } from "./user-data";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const [snapshot, profiles] = await Promise.all([
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    listAccessProfiles(db, actor.organizationId),
  ]);
  const profileNames = new Map(
    profiles.map((profile) => [profile.id, profile.name]),
  );
  const users = snapshot.docs
    .map((doc) => toManagedUser(doc, profileNames))
    .sort((a, b) => b.createdAt - a.createdAt);
  const saved = (await searchParams).saved;

  return (
    <UserManagement
      users={users}
      currentUserId={actor.id}
      canViewAs={!actor.impersonatedBy}
      saved={saved === "created" || saved === "updated" ? saved : null}
    />
  );
}
