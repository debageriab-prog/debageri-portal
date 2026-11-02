import Link from "next/link";
import { getTranslator } from "@/lib/localization/server";
import { AccessProfileForm } from "../AccessProfileForm";

export default async function NewAccessProfilePage() {
  const t = await getTranslator();
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
      <AccessProfileForm />
    </>
  );
}
