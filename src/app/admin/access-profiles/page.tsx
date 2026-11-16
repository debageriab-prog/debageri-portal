import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { listAccessProfiles } from "@/server/services/access-profile-service";
import { listUserGroups } from "@/server/services/user-group-service";
import { AccessProfileList } from "./AccessProfileList";

export default async function AccessProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = (await verifySession())!;
  const saved = (await searchParams).saved;
  const { db } = getAdminServices();
  const [profiles, groups] = await Promise.all([
    listAccessProfiles(db, actor.organizationId),
    listUserGroups(db, actor.organizationId),
  ]);
  return (
    <AccessProfileList
      profiles={profiles}
      groups={groups}
      saved={saved === "created" || saved === "updated" ? saved : null}
    />
  );
}
