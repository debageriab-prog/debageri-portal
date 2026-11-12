import { can } from "@/domain/access/permissions";
import { redirect } from "next/navigation";
import { expensableReceipt } from "@/server/services/receipt-service";
import { requestCategoryId } from "@/domain/requests";
import {
  expensableRequest,
  storedRequestFiles,
} from "@/server/services/request-service";
import {
  linkableAsset,
  storedAssetFiles,
} from "@/server/services/asset-service";
import { aiExtractionEnabledFor } from "@/server/services/ai-service";
import { accountingRecipientsFor } from "@/server/services/accounting-email-service";
import { convertibleIncomingEmail } from "@/server/services/incoming-email-service";
import {
  type ExpenseReceipt,
  type ExpenseRequest,
  type TransactionAsset,
  TransactionForm,
} from "../../FinanceForms";
import type { IncomingEmailSource } from "../../incoming-email-prefill";
import { financeFormContext, financeUsers } from "../../form-data";
import {
  safeTransactionReturnHref,
  transactionDefaultDate,
} from "../../transaction-navigation";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    receiptId?: string;
    requestId?: string;
    incomingEmailId?: string;
    assetId?: string;
    assetLink?: string;
  }>;
}) {
  const params = await searchParams;
  const { actor, db } = await financeFormContext("finance.ledger.add");
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
  let request: ExpenseRequest | undefined;
  if (params.requestId && !receipt) {
    const data = await expensableRequest(db, actor, params.requestId).catch(
      () => null,
    );
    if (!data) redirect("/requests");
    request = {
      id: data.id,
      userId: String(data.userId),
      userName: String(data.userName),
      type: String(data.type),
      title: String(data.title),
      description: String(data.description ?? ""),
      estimatedCostMinor: Number(data.estimatedCostMinor ?? 0),
      payer: data.payer === "self" ? "self" : "company",
      vatRateBps:
        typeof data.vatRateBps === "number" ? Number(data.vatRateBps) : null,
      categoryId: null,
      files: storedRequestFiles(data.files).map((file) => ({
        id: file.id,
        name: file.name,
        contentType: file.contentType,
      })),
    };
  }
  let asset: TransactionAsset | undefined;
  const assetLink =
    params.assetLink === "purchase" || params.assetLink === "sale"
      ? params.assetLink
      : null;
  if (params.assetId && assetLink && !receipt && !request) {
    const data = await linkableAsset(
      db,
      actor,
      params.assetId,
      assetLink,
    ).catch(() => null);
    if (!data) redirect(`/assets/${encodeURIComponent(params.assetId)}`);
    asset = {
      id: data.id,
      link: assetLink,
      name: String(data.name),
      amountMinor:
        assetLink === "purchase"
          ? Number(data.purchasePriceMinor ?? 0)
          : Number(data.sale?.priceMinor ?? 0),
      vatRateBps: Number(data.vatRateBps ?? 2_500),
      date:
        assetLink === "purchase"
          ? data.purchaseDate
            ? String(data.purchaseDate)
            : null
          : String(data.sale?.date ?? "") || null,
      files:
        assetLink === "purchase"
          ? storedAssetFiles(data.files).map((file) => ({
              id: file.id,
              name: file.name,
              contentType: file.contentType,
            }))
          : [],
    };
  }
  let incomingEmail: IncomingEmailSource | undefined;
  if (params.incomingEmailId && !receipt && !request && !asset) {
    incomingEmail = await convertibleIncomingEmail(
      db,
      actor,
      params.incomingEmailId,
    ).catch(() => undefined);
    if (!incomingEmail) redirect("/finance/incoming-emails");
  }
  const returnHref = receipt
    ? "/receipts"
    : request
      ? "/requests"
      : asset
        ? `/assets/${encodeURIComponent(asset.id)}`
        : incomingEmail
          ? "/finance/incoming-emails"
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
  if (request)
    request = {
      ...request,
      categoryId: requestCategoryId(request.type, categories),
    };
  return (
    <TransactionForm
      users={await financeUsers()}
      categories={categories}
      returnHref={returnHref}
      receipt={receipt}
      request={request}
      asset={asset}
      canCreateAssets={can(actor, "assets.manage")}
      incomingEmail={incomingEmail}
      accountingRecipients={await accountingRecipientsFor(
        actor,
        db,
        "transactions",
      )}
      aiEnabled={await aiExtractionEnabledFor(actor, db, "financeAttachments")}
      defaultDate={transactionDefaultDate(
        returnHref,
        new Date().toISOString().slice(0, 10),
      )}
    />
  );
}
