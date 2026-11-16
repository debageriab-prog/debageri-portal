import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { listUserGroups } from "@/server/services/user-group-service";
import { UserGroupForm } from "../../UserGroupForm";

export default async function EditUserGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const t = await getTranslator();
  const groups = await listUserGroups(
    getAdminServices().db,
    actor.organizationId,
  );
  const group = groups.find((candidate) => candidate.id === id);
  if (!group) notFound();
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/groups">
            ← {t("backToUserGroups")}
          </Link>
          <h1>{group.name}</h1>
          <p className="muted page-description">
            {t("userGroupFormDescription")}
          </p>
        </div>
      </div>
      <UserGroupForm group={group} />
    </>
  );
}
