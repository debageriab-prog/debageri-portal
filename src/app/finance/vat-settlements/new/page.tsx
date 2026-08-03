import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { vatPayableMinor } from "@/domain/finance/calculations";
import { VatSettlementForm } from "./VatSettlementForm";

export default async function NewVatSettlementPage() {
  const actor = (await verifySession())!;
  if (!["admin", "accountant"].includes(actor.role)) redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [transactions, settlements] = await Promise.all([
    db
      .collection("financialTransactions")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("vatSettlements")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const payableMinor = vatPayableMinor(
    transactions.docs.map((document) => ({
      direction: document.data().direction,
      vatMinor: Number(document.data().vatMinor ?? 0),
    })),
    settlements.docs.map((document) => ({
      amountMinor: Number(document.data().amountMinor ?? 0),
      status: document.data().status,
    })),
  );
  return (
    <>
      <div className="topbar">
        <div>
          <Link className="text-link" href="/finance/vat-settlements">
            ← {t("backToVatSettlements")}
          </Link>
          <h1>{t("recordVatPayment")}</h1>
          <p className="muted page-description">
            {t("recordVatPaymentDescription")}
          </p>
        </div>
      </div>
      <section className="card">
        <VatSettlementForm payableMinor={payableMinor} locale={actor.locale} />
      </section>
    </>
  );
}
