import { redirect } from "next/navigation";
import { requestTypesFor } from "@/domain/requests";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canSubmitRequests } from "@/server/services/request-service";
import { RequestForm } from "../RequestForm";

export default async function NewRequestPage() {
  const actor = (await verifySession())!;
  if (!canSubmitRequests(actor)) redirect("/unauthorized");
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("requests")}</div>
          <h1>{t("newRequest")}</h1>
          <p className="muted page-description">{t("newRequestDescription")}</p>
        </div>
      </div>
      <RequestForm types={requestTypesFor(actor)} />
    </>
  );
}
