import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { listUserGroups } from "@/server/services/user-group-service";
import { UserGroupList } from "./UserGroupList";

export default async function UserGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = (await verifySession())!;
  const saved = (await searchParams).saved;
  return (
    <UserGroupList
      groups={await listUserGroups(getAdminServices().db, actor.organizationId)}
      saved={saved === "created" || saved === "updated" ? saved : null}
    />
  );
}
