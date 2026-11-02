import { CategoryForm } from "../../FinanceForms";
import { financeFormContext } from "../../form-data";

export default async function NewCategoryPage() {
  await financeFormContext("finance.categories.add");
  return <CategoryForm />;
}
