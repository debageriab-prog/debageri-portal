import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  VatSettlementHistory,
  type VatSettlementRow,
} from "./VatSettlementHistory";

export default async function VatSettlementsPage() {
  const actor = (await verifySession())!;
  if (!["admin", "accountant"].includes(actor.role)) redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [snapshot, attachmentsSnapshot] = await Promise.all([
    db
      .collection("vatSettlements")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("financeAttachments")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const attachments = new Map<string, Array<{ id: string; name: string }>>();
  for (const document of attachmentsSnapshot.docs) {
    const data = document.data();
    if (data.entityType !== "vatSettlement") continue;
    const entityAttachments = attachments.get(String(data.entityId)) ?? [];
    entityAttachments.push({ id: document.id, name: String(data.name) });
    attachments.set(String(data.entityId), entityAttachments);
  }
  const settlements: VatSettlementRow[] = snapshot.docs
    .map((document) => ({
      id: document.id,
      paymentDate: String(document.data().paymentDate),
      periodFrom: String(document.data().periodFrom),
      periodTo: String(document.data().periodTo),
      amountMinor: Number(document.data().amountMinor),
      reference: String(document.data().reference ?? ""),
      note: String(document.data().note ?? ""),
      status: document.data().status as "active" | "reversed",
      reversalReason: String(document.data().reversalReason ?? ""),
      attachments: attachments.get(document.id) ?? [],
    }))
    .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{t("vatSettlements")}</h1>
          <p className="muted page-description">
            {t("vatSettlementsDescription")}
          </p>
        </div>
        <Link className="button" href="/finance/vat-settlements/new">
          {t("recordVatPayment")}
        </Link>
      </div>
      <VatSettlementHistory settlements={settlements} locale={actor.locale} />
    </>
  );
}
