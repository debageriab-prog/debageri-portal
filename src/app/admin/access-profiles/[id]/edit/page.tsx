import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { listAccessProfiles } from "@/server/services/access-profile-service";
import { AccessProfileForm } from "../../AccessProfileForm";

export default async function EditAccessProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const t = await getTranslator();
  const profiles = await listAccessProfiles(
    getAdminServices().db,
    actor.organizationId,
  );
  const profile = profiles.find((candidate) => candidate.id === id);
  if (!profile) notFound();
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/access-profiles">
            ← {t("backToAccessProfiles")}
          </Link>
          <h1>{profile.name}</h1>
          <p className="muted page-description">
            {t("accessProfileFormDescription")}
          </p>
        </div>
      </div>
      <AccessProfileForm profile={profile} />
    </>
  );
}
