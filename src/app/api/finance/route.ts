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
  createInvoiceArticle,
  updateInvoiceArticle,
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
  updateInvoice,
  updateInvoiceLabels,
  voidFinancialTransaction,
  voidInvoice,
} from "@/server/services/finance-service";
import {
  approvedInvoiceHours,
  generateInvoicePdf,
  previewInvoicePdf,
  sendInvoiceToCustomer,
} from "@/server/services/invoice-document-service";
import { downloadResponse } from "@/server/export/download";
import {
  bookSalarySlips,
  generatePayslips,
  generateSalaryRun,
  removeSalarySlip,
  reverseSalarySlip,
  setSalarySlipStatus,
  setSalarySlipTimeReports,
  updateSalarySlip,
} from "@/server/services/salary-service";
import {
  notifyPayslipPublished,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { PDF_CONTENT_TYPE } from "@/server/export/invoice-pdf";
import {
  expensableReceipt,
  linkReceiptExpense,
  ReceiptError,
} from "@/server/services/receipt-service";
import {
  expensableRequest,
  linkRequestExpense,
  RequestError,
} from "@/server/services/request-service";
import {
  convertibleIncomingEmail,
  IncomingEmailError,
  linkIncomingEmail,
} from "@/server/services/incoming-email-service";
import type { PortalUser } from "@/domain/types";
import type { Firestore } from "firebase-admin/firestore";

/** Marks the forwarded email as used; the new record stays either way. */
async function linkEmail(
  db: Firestore,
  actor: PortalUser,
  incomingEmailId: string,
  entity: { type: "transaction" | "invoice"; id: string },
) {
  await linkIncomingEmail(db, actor, incomingEmailId, entity).catch(
    (error: unknown) =>
      console.error("Incoming email link failed", {
        incomingEmailId,
        entityId: entity.id,
        errorClass: error instanceof Error ? error.name : "unknown",
      }),
  );
}

/**
 * Generates the PDF of an invoice that was just saved. The invoice stays
 * saved either way; a failure is returned as its error code.
 */
async function pdfAfterSave(
  db: Firestore,
  storage: ReturnType<typeof getAdminServices>["storage"],
  actor: PortalUser,
  invoiceId: string,
) {
  try {
    await generateInvoicePdf(db, storage, actor, invoiceId);
    return undefined;
  } catch (error) {
    if (error instanceof FinanceError) return error.code;
    console.error("Invoice PDF after save failed", {
      invoiceId,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    return "financeOperationFailed";
  }
}

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
  const { db, storage } = getAdminServices();
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
      case "createInvoice": {
        const { incomingEmailId, ...invoice } = parsed.data;
        if (incomingEmailId)
          await convertibleIncomingEmail(db, actor, incomingEmailId);
        id = await createInvoice(db, actor, invoice);
        if (incomingEmailId)
          await linkEmail(db, actor, incomingEmailId, {
            type: "invoice",
            id,
          });
        if (invoice.generatePdf)
          return NextResponse.json({
            ok: true,
            id,
            pdfError: await pdfAfterSave(db, storage, actor, id),
          });
        break;
      }
      case "updateInvoice":
        await updateInvoice(db, actor, parsed.data);
        id = parsed.data.invoiceId;
        if (parsed.data.generatePdf)
          return NextResponse.json({
            ok: true,
            id,
            pdfError: await pdfAfterSave(db, storage, actor, id),
          });
        break;
      case "generateInvoicePdf": {
        const result = await generateInvoicePdf(
          db,
          storage,
          actor,
          parsed.data.invoiceId,
        );
        return NextResponse.json({
          ok: true,
          id: parsed.data.invoiceId,
          generatedAt: result.generatedAt,
        });
      }
      case "sendInvoiceToCustomer": {
        const result = await sendInvoiceToCustomer(
          db,
          storage,
          actor,
          parsed.data.invoiceId,
        );
        return NextResponse.json({
          ok: true,
          id: parsed.data.invoiceId,
          ...result,
        });
      }
      case "updateInvoiceLabels":
        await updateInvoiceLabels(db, actor, parsed.data);
        id = parsed.data.invoiceId;
        break;
      case "createArticle":
        id = await createInvoiceArticle(db, actor, parsed.data);
        break;
      case "updateArticle":
        await updateInvoiceArticle(db, actor, parsed.data);
        id = parsed.data.articleId;
        break;
      case "previewInvoicePdf": {
        const preview = await previewInvoicePdf(db, actor, parsed.data);
        return downloadResponse(
          preview.fileName,
          PDF_CONTENT_TYPE,
          preview.pdf,
        );
      }
      case "invoiceHours":
        return NextResponse.json({
          ok: true,
          ...(await approvedInvoiceHours(db, actor, parsed.data)),
        });
      case "markInvoicePaid":
        id = await markInvoicePaid(db, actor, parsed.data);
        break;
      case "createTransaction": {
        const { receiptId, requestId, incomingEmailId } = parsed.data;
        if ([receiptId, requestId, incomingEmailId].filter(Boolean).length > 1)
          throw new FinanceError("invalidInput");
        if (incomingEmailId)
          await convertibleIncomingEmail(db, actor, incomingEmailId);
        if (receiptId || requestId) {
          if (parsed.data.direction !== "expense")
            throw new FinanceError("invalidInput");
          if (receiptId) await expensableReceipt(db, actor, receiptId);
          if (requestId) await expensableRequest(db, actor, requestId);
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
          shareBpsOverride: parsed.data.shareBpsOverride,
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
        if (requestId) {
          const transactionId = id;
          await linkRequestExpense(db, actor, requestId, transactionId).catch(
            (error: unknown) =>
              console.error("Request expense link failed", {
                requestId,
                transactionId,
                errorClass: error instanceof Error ? error.name : "unknown",
              }),
          );
        }
        if (incomingEmailId)
          await linkEmail(db, actor, incomingEmailId, {
            type: "transaction",
            id,
          });
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
          shareBpsOverride: parsed.data.shareBpsOverride,
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
      case "generateSalaryRun":
        id = (await generateSalaryRun(db, actor, parsed.data)).id;
        break;
      case "updateSalarySlip":
        id = await updateSalarySlip(db, actor, parsed.data);
        break;
      case "setSalarySlipStatus":
        await setSalarySlipStatus(db, actor, parsed.data);
        break;
      case "generatePayslips":
        await generatePayslips(db, storage, actor, parsed.data);
        break;
      case "bookSalarySlips": {
        const { published } = await bookSalarySlips(
          db,
          storage,
          actor,
          parsed.data,
        );
        const portalUrl = portalUrlFrom(request);
        for (const payslipId of published)
          await notifyPayslipPublished(payslipId, portalUrl);
        break;
      }
      case "reverseSalarySlip":
        await reverseSalarySlip(db, actor, parsed.data);
        break;
      case "setSalarySlipTimeReports":
        await setSalarySlipTimeReports(db, actor, parsed.data);
        break;
      case "removeSalarySlip":
        await removeSalarySlip(db, storage, actor, parsed.data);
        break;
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof IncomingEmailError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof ReceiptError)
      return NextResponse.json(
        { error: "receiptNotExpensable" },
        { status: error.status === 403 ? 403 : 409 },
      );
    if (error instanceof RequestError)
      return NextResponse.json(
        { error: "requestNotExpensable" },
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
