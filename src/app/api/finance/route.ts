import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeActionSchema } from "@/server/validators/finance";
import {
  createCategory,
  createCustomer,
  createFinancialTransaction,
  createExpenseCopies,
  createInvoice,
  deleteFinancialTransaction,
  enableFinance,
  FinanceError,
  markInvoicePaid,
  setCompensation,
  setCompensationValidTo,
  updateCategory,
  updateCustomer,
  voidFinancialTransaction,
  voidInvoice,
} from "@/server/services/finance-service";

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
      case "createTransaction":
        id = await createFinancialTransaction(db, actor, parsed.data);
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
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
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
