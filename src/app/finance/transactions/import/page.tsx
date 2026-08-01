import { ImportPage } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function TransactionImportPage() {
  await financeFormContext();
  return <ImportPage kind="transactions" />;
}
