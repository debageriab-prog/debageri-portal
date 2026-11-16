import Link from "next/link";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { listUserGroups } from "@/server/services/user-group-service";
import { AccessProfileForm } from "../AccessProfileForm";

export default async function NewAccessProfilePage() {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const groups = await listUserGroups(
    getAdminServices().db,
    actor.organizationId,
  );
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/access-profiles">
            ← {t("backToAccessProfiles")}
          </Link>
          <h1>{t("addAccessProfile")}</h1>
          <p className="muted page-description">
            {t("accessProfileFormDescription")}
          </p>
        </div>
      </div>
      <AccessProfileForm groups={groups} />
    </>
  );
}
