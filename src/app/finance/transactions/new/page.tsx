import { TransactionForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";
import { safeTransactionReturnHref } from "../../transaction-navigation";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { actor, db } = await financeFormContext();
  const snapshot = await db
    .collection("financeCategories")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const categories = snapshot.docs.map((document) => ({
    id: document.id,
    code: String(document.data().code),
    name: document.data().name as { en: string; sv: string },
    direction: document.data().direction as "income" | "expense",
    active: document.data().active !== false,
  }));
  return (
    <TransactionForm
      users={await financeUsers()}
      categories={categories}
      returnHref={safeTransactionReturnHref((await searchParams).returnTo)}
    />
  );
}
