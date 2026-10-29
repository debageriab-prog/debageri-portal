import { isAiFeatureEnabled } from "@/server/services/ai-service";
import { accountingRecipientLabels } from "@/server/services/accounting-email-service";
import { InvoiceForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function NewInvoicePage() {
  const { actor, db } = await financeFormContext();
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
      accountingRecipients={await accountingRecipientLabels(
        db,
        actor.organizationId,
        "invoices",
      )}
      aiEnabled={await isAiFeatureEnabled(
        db,
        actor.organizationId,
        "financeInvoices",
      )}
    />
  );
}
