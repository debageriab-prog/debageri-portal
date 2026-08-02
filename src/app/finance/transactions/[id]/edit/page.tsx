import { notFound } from "next/navigation";
import {
  TransactionForm,
  type EditableTransaction,
} from "../../../FinanceForms";
import { financeFormContext, financeUsers } from "../../../form-data";
import { safeTransactionReturnHref } from "../../../transaction-navigation";

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { actor, db } = await financeFormContext();
  const [transactionSnapshot, categorySnapshot, users] = await Promise.all([
    db.collection("financialTransactions").doc(id).get(),
    db
      .collection("financeCategories")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    financeUsers(),
  ]);
  const data = transactionSnapshot.data();
  if (
    !transactionSnapshot.exists ||
    data?.organizationId !== actor.organizationId ||
    data.invoiceId ||
    data.status === "reversal" ||
    data.reversedByTransactionId
  )
    notFound();

  const transaction: EditableTransaction = {
    id: transactionSnapshot.id,
    direction: data.direction as "income" | "expense",
    categoryId: String(data.categoryId),
    consultantId: data.consultantId ?? null,
    date: String(data.date),
    netMinor: Number(data.netMinor),
    grossMinor: Number(
      data.grossMinor ?? Number(data.netMinor) + Number(data.vatMinor ?? 0),
    ),
    vatRateBps: Number(data.vatRateBps),
    funding: data.funding ?? null,
    applyConsultantShare: data.applyConsultantShare === true,
    visibleDescription: String(data.visibleDescription ?? ""),
    internalNote: String(data.internalNote ?? ""),
  };
  const categories = categorySnapshot.docs.map((document) => ({
    id: document.id,
    code: String(document.data().code),
    name: document.data().name as { en: string; sv: string },
    direction: document.data().direction as "income" | "expense",
    active: document.data().active !== false,
  }));

  return (
    <TransactionForm
      users={users}
      categories={categories}
      transaction={transaction}
      returnHref={safeTransactionReturnHref((await searchParams).returnTo)}
    />
  );
}
