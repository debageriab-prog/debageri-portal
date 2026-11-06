import { ArticleForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function NewArticlePage() {
  await financeFormContext("finance.articles.add");
  return <ArticleForm users={await financeUsers()} />;
}
