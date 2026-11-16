import Link from "next/link";
import { getTranslator } from "@/lib/localization/server";
import { UserGroupForm } from "../UserGroupForm";

export default async function NewUserGroupPage() {
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/admin/groups">
            ← {t("backToUserGroups")}
          </Link>
          <h1>{t("addUserGroup")}</h1>
          <p className="muted page-description">
            {t("userGroupFormDescription")}
          </p>
        </div>
      </div>
      <UserGroupForm />
    </>
  );
}
