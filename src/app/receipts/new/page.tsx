import { redirect } from "next/navigation";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { canSubmitReceipts } from "@/server/services/receipt-service";
import { ReceiptForm } from "./ReceiptForm";

export default async function NewReceiptPage() {
  const actor = (await verifySession())!;
  if (!canSubmitReceipts(actor)) redirect("/unauthorized");
  const t = await getTranslator();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
  }).format(new Date());
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("receipts")}</div>
          <h1>{t("uploadReceipt")}</h1>
          <p className="muted page-description">
            {t("uploadReceiptDescription")}
          </p>
        </div>
      </div>
      <ReceiptForm today={today} />
    </>
  );
}
