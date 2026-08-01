import { TransactionForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function NewTransactionPage() {
  const { actor, db } = await financeFormContext();
  const snapshot = await db
    .collection("financeCategories")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const categories = snapshot.docs.map((document) => ({
    id: document.id,
    name: document.data().name as { en: string; sv: string },
    direction: document.data().direction as "income" | "expense",
    active: document.data().active !== false,
  }));
  return (
    <TransactionForm users={await financeUsers()} categories={categories} />
  );
}
