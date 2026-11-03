import { redirect } from "next/navigation";
import { aiExtractionEnabledFor } from "@/server/services/ai-service";
import { convertibleIncomingEmail } from "@/server/services/incoming-email-service";
import { accountingRecipientsFor } from "@/server/services/accounting-email-service";
import { InvoiceForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";
import type { IncomingEmailSource } from "../../incoming-email-prefill";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ incomingEmailId?: string }>;
}) {
  const { actor, db } = await financeFormContext("finance.invoices.add");
  const { incomingEmailId } = await searchParams;
  let incomingEmail: IncomingEmailSource | undefined;
  if (incomingEmailId) {
    incomingEmail = await convertibleIncomingEmail(
      db,
      actor,
      incomingEmailId,
    ).catch(() => undefined);
    if (!incomingEmail) redirect("/finance/incoming-emails");
  }
  const customers = await db
    .collection("financeCustomers")
    .where("organizationId", "==", actor.organizationId)
    .get();
  return (
    <InvoiceForm
      users={await financeUsers()}
      customers={customers.docs
        .map((document) => ({
          id: document.id,
          name: String(document.data().name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))}
      accountingRecipients={await accountingRecipientsFor(
        actor,
        db,
        "invoices",
      )}
      aiEnabled={await aiExtractionEnabledFor(actor, db, "financeInvoices")}
      incomingEmail={incomingEmail}
    />
  );
}
