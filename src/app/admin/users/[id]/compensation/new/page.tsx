import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { financeEnabled } from "../../../user-data";
import { CompensationForm } from "./CompensationForm";

export default async function NewCompensationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  const { id } = await params;
  const t = await getTranslator();
  const { db } = getAdminServices();
  const snapshot = await db.collection("users").doc(id).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    notFound();
  const editHref = `/admin/users/${encodeURIComponent(id)}/edit?tab=compensation`;
  if (
    data?.role !== "consultant" ||
    !(await financeEnabled(db, actor.organizationId))
  )
    redirect(editHref);
  const name = String(data.displayName);
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href={editHref}>
            ← {t("backToEmployee").replace("{name}", name)}
          </Link>
          <h1>{t("addCompensation")}</h1>
          <p className="muted page-description">
            {t("newCompensationDescription").replace("{name}", name)}
          </p>
        </div>
      </div>
      <CompensationForm employeeId={id} />
    </>
  );
}
