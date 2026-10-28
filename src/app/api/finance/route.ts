import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeActionSchema } from "@/server/validators/finance";
import {
  calculateTransactionAmounts,
  type TransactionAmountMode,
} from "@/domain/finance/calculations";
import {
  createCategory,
  createCustomer,
  createFinancialTransaction,
  createExpenseCopies,
  createInvoice,
  createVatSettlement,
  updateVatSettlement,
  deleteFinancialTransaction,
  enableFinance,
  FinanceError,
  markInvoicePaid,
  reverseVatSettlement,
  setCompensation,
  setCompensationValidTo,
  updateCategory,
  updateCustomer,
  updateFinancialTransaction,
  voidFinancialTransaction,
  voidInvoice,
} from "@/server/services/finance-service";
import {
  expensableReceipt,
  linkReceiptExpense,
  ReceiptError,
} from "@/server/services/receipt-service";

function transactionAmounts(data: {
  amountMode: TransactionAmountMode;
  amountMinor: number;
  vatMinor: number | null;
  roundingMinor: number;
  vatRateBps: number;
}) {
  if (data.amountMode === "netVat" && data.vatMinor === null)
    throw new FinanceError("invalidInput");
  return calculateTransactionAmounts(
    data.amountMode,
    data.amountMinor,
    data.vatRateBps,
    data.vatMinor,
    data.roundingMinor,
  );
}

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = financeActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  try {
    if (parsed.data.action !== "enableFinance") {
      const organization = await db
        .collection("organizations")
        .doc(actor.organizationId)
        .get();
      if (organization.data()?.financeEnabled !== true)
        throw new FinanceError("financeDisabled", 409);
    }
    let id: string | undefined;
    switch (parsed.data.action) {
      case "enableFinance":
        await enableFinance(db, actor);
        break;
      case "setCompensation":
        id = await setCompensation(db, actor, parsed.data);
        break;
      case "setCompensationValidTo":
        await setCompensationValidTo(db, actor, parsed.data);
        break;
      case "createCustomer":
        id = await createCustomer(db, actor, parsed.data);
        break;
      case "updateCustomer":
        await updateCustomer(db, actor, parsed.data);
        break;
      case "createCategory":
        id = await createCategory(db, actor, parsed.data);
        break;
      case "updateCategory":
        await updateCategory(db, actor, parsed.data);
        break;
      case "createInvoice":
        id = await createInvoice(db, actor, parsed.data);
        break;
      case "markInvoicePaid":
        id = await markInvoicePaid(db, actor, parsed.data);
        break;
      case "createTransaction": {
        const receiptId = parsed.data.receiptId;
        if (receiptId) {
          if (parsed.data.direction !== "expense")
            throw new FinanceError("invalidInput");
          await expensableReceipt(db, actor, receiptId);
        }
        id = await createFinancialTransaction(db, actor, {
          direction: parsed.data.direction,
          categoryId: parsed.data.categoryId,
          consultantId: parsed.data.consultantId,
          date: parsed.data.date,
          ...transactionAmounts(parsed.data),
          vatRateBps: parsed.data.vatRateBps,
          funding: parsed.data.funding,
          applyConsultantShare: parsed.data.applyConsultantShare,
          visibleDescription: parsed.data.visibleDescription,
          internalNote: parsed.data.internalNote,
          importKey: null,
        });
        if (receiptId) {
          const transactionId = id;
          await linkReceiptExpense(db, actor, receiptId, transactionId).catch(
            (error: unknown) =>
              console.error("Receipt expense link failed", {
                receiptId,
                transactionId,
                errorClass: error instanceof Error ? error.name : "unknown",
              }),
          );
        }
        break;
      }
      case "updateTransaction":
        id = await updateFinancialTransaction(db, actor, {
          transactionId: parsed.data.transactionId,
          direction: parsed.data.direction,
          categoryId: parsed.data.categoryId,
          consultantId: parsed.data.consultantId,
          date: parsed.data.date,
          ...transactionAmounts(parsed.data),
          vatRateBps: parsed.data.vatRateBps,
          funding: parsed.data.funding,
          applyConsultantShare: parsed.data.applyConsultantShare,
          visibleDescription: parsed.data.visibleDescription,
          internalNote: parsed.data.internalNote,
          importKey: null,
        });
        break;
      case "createExpenseCopies":
        id = await createExpenseCopies(db, actor, parsed.data);
        break;
      case "voidTransaction":
        id = await voidFinancialTransaction(db, actor, parsed.data);
        break;
      case "deleteTransaction":
        await deleteFinancialTransaction(db, actor, parsed.data);
        break;
      case "voidInvoice":
        await voidInvoice(db, actor, parsed.data);
        break;
      case "createVatSettlement":
        id = await createVatSettlement(db, actor, parsed.data);
        break;
      case "updateVatSettlement":
        id = await updateVatSettlement(db, actor, parsed.data);
        break;
      case "reverseVatSettlement":
        await reverseVatSettlement(db, actor, parsed.data);
        break;
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof ReceiptError)
      return NextResponse.json(
        { error: "receiptNotExpensable" },
        { status: error.status === 403 ? 403 : 409 },
      );
    console.error("Finance operation failed", {
      actorId: actor.id,
      organizationId: actor.organizationId,
      action: parsed.data.action,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "financeOperationFailed" },
      { status: 500 },
    );
  }
}
