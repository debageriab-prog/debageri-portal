import { CompensationForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function NewCompensationPage() {
  await financeFormContext(true);
  return <CompensationForm users={await financeUsers()} />;
}
