import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { listAccessProfiles } from "@/server/services/access-profile-service";
import { AccessProfileList } from "./AccessProfileList";

export default async function AccessProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = (await verifySession())!;
  const saved = (await searchParams).saved;
  return (
    <AccessProfileList
      profiles={await listAccessProfiles(
        getAdminServices().db,
        actor.organizationId,
      )}
      saved={saved === "created" || saved === "updated" ? saved : null}
    />
  );
}
