import { CustomerForm } from "../../FinanceForms";
import { financeFormContext, invoiceSettingsFor } from "../../form-data";

export default async function NewCustomerPage() {
  const { actor, db } = await financeFormContext("finance.customers.add");
  const settings = await invoiceSettingsFor(db, actor.organizationId);
  return <CustomerForm nextCustomerNumber={settings.nextCustomerNumber} />;
}
