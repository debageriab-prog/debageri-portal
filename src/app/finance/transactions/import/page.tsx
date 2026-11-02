import { ImportPage } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function TransactionImportPage() {
  await financeFormContext("finance.ledger.import");
  return <ImportPage kind="transactions" />;
}
