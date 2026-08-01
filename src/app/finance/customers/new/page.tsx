import { CustomerForm } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function NewCustomerPage() {
  await financeFormContext();
  return <CustomerForm />;
}
