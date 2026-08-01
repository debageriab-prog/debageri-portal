import { ExpenseCopyForm } from "../../ExpenseCopyForm";
import { financeFormContext, financeUsers } from "../../form-data";

export default async function CopyExpensesPage() {
  const { actor, db } = await financeFormContext();
  const [categorySnapshot, transactionSnapshot, users] = await Promise.all([
    db
      .collection("financeCategories")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("financialTransactions")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    financeUsers(),
  ]);
  const categories = categorySnapshot.docs
    .map((document) => ({
      id: document.id,
      name: document.data().name as { en: string; sv: string },
      active: document.data().active !== false,
      direction: String(document.data().direction),
    }))
    .filter((category) => category.direction === "expense");
  const expenses = transactionSnapshot.docs
    .map((document) => ({
      id: document.id,
      consultantId: document.data().consultantId ?? null,
      date: String(document.data().date),
      categoryId: String(document.data().categoryId),
      netMinor: Number(document.data().netMinor),
      vatRateBps: Number(document.data().vatRateBps),
      funding: document.data().funding as "company" | "consultant",
      visibleDescription: String(document.data().visibleDescription ?? ""),
      internalNote: String(document.data().internalNote ?? ""),
      direction: String(document.data().direction),
      status: String(document.data().status),
      reversedByTransactionId: document.data().reversedByTransactionId ?? null,
    }))
    .filter(
      (transaction) =>
        transaction.direction === "expense" &&
        transaction.status === "posted" &&
        !transaction.reversedByTransactionId &&
        transaction.netMinor >= 0,
    );
  return (
    <ExpenseCopyForm
      users={users}
      categories={categories}
      expenses={expenses}
    />
  );
}
