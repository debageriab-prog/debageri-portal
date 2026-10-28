import { redirect } from "next/navigation";
import { expensableReceipt } from "@/server/services/receipt-service";
import { isAiFeatureEnabled } from "@/server/services/ai-service";
import { type ExpenseReceipt, TransactionForm } from "../../FinanceForms";
import { financeFormContext, financeUsers } from "../../form-data";
import {
  safeTransactionReturnHref,
  transactionDefaultDate,
} from "../../transaction-navigation";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; receiptId?: string }>;
}) {
  const params = await searchParams;
  const { actor, db } = await financeFormContext();
  let receipt: ExpenseReceipt | undefined;
  if (params.receiptId) {
    const data = await expensableReceipt(db, actor, params.receiptId).catch(
      () => null,
    );
    if (!data) redirect("/receipts");
    receipt = {
      id: data.id,
      userId: String(data.userId),
      userName: String(data.userName),
      date: String(data.date),
      name: String(data.name),
      description: String(data.description ?? ""),
      netMinor: Number(data.netMinor ?? 0),
      vatMinor: Number(data.vatMinor ?? 0),
      fileName: String(data.fileName),
      contentType: String(data.contentType),
    };
  }
  const returnHref = receipt
    ? "/receipts"
    : safeTransactionReturnHref(params.returnTo);
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
      returnHref={returnHref}
      receipt={receipt}
      aiEnabled={await isAiFeatureEnabled(
        db,
        actor.organizationId,
        "financeAttachments",
      )}
      defaultDate={transactionDefaultDate(
        returnHref,
        new Date().toISOString().slice(0, 10),
      )}
    />
  );
}
