import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vatPayableMinor } from "@/domain/finance/calculations";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { VatSettlementForm } from "../../new/VatSettlementForm";

export default async function EditVatSettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = (await verifySession())!;
  if (!["admin", "accountant"].includes(actor.role)) redirect("/unauthorized");
  const { id } = await params;
  const { db } = getAdminServices();
  const [document, transactions, settlements] = await Promise.all([
    db.collection("vatSettlements").doc(id).get(),
    db
      .collection("financialTransactions")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("vatSettlements")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const data = document.data();
  if (
    !data ||
    data.organizationId !== actor.organizationId ||
    data.status !== "active"
  )
    notFound();
  const payableMinor =
    vatPayableMinor(
      transactions.docs.map((item) => ({
        direction: item.data().direction,
        vatMinor: Number(item.data().vatMinor ?? 0),
      })),
      settlements.docs.map((item) => ({
        amountMinor: Number(item.data().amountMinor ?? 0),
        status: item.data().status,
      })),
    ) + Number(data.amountMinor ?? 0);
  const t = await getTranslator();
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/finance/vat-settlements">
            {"\u2190"} {t("backToVatSettlements")}
          </Link>
          <h1>{t("editVatSettlement")}</h1>
          <p className="muted page-description">
            {t("editVatSettlementDescription")}
          </p>
        </div>
      </div>
      <section className="card">
        <VatSettlementForm
          payableMinor={payableMinor}
          locale={actor.locale}
          settlement={{
            id,
            paymentDate: String(data.paymentDate),
            periodFrom: String(data.periodFrom),
            periodTo: String(data.periodTo),
            amountMinor: Number(data.amountMinor),
            reference: String(data.reference ?? ""),
            note: String(data.note ?? ""),
          }}
        />
      </section>
    </>
  );
}
