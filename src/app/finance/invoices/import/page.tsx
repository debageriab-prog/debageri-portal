import { ImportPage } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function InvoiceImportPage() {
  await financeFormContext("finance.invoices.import");
  return <ImportPage kind="invoices" />;
}
