import { ImportPage } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function InvoiceImportPage() {
  await financeFormContext();
  return <ImportPage kind="invoices" />;
}
