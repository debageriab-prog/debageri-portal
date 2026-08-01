import { CategoryForm } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function NewCategoryPage() {
  await financeFormContext(true);
  return <CategoryForm />;
}
