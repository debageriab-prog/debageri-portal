import { aiExtractionEnabledFor } from "@/server/services/ai-service";
import { accountingRecipientsFor } from "@/server/services/accounting-email-service";
import { InvoiceForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function NewInvoicePage() {
  const { actor, db } = await financeFormContext("finance.invoices.edit");
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
    />
  );
}
