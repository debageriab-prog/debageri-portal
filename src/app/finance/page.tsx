import { madeWithGenerator } from "@/domain/finance/invoice-lines";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import { redirect } from "next/navigation";
import {
  can,
  financeHome,
  hasOrganizationFinance,
  type PermissionKey,
} from "@/domain/access/permissions";
import {
  canViewMyFinance,
  canViewMyTransactions,
} from "@/domain/finance/calculations";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { FinanceDashboard, type FinancePageData } from "./FinanceDashboard";

function millis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value
    ? (value as { toMillis(): number }).toMillis()
    : 0;
}

const financeSections = [
  "overview",
  "invoices",
  "categories",
  "transactions",
  "customers",
  "articles",
] as const;

const sectionPermissions: Record<
  (typeof financeSections)[number],
  PermissionKey
> = {
  overview: "finance.ledger.view",
  transactions: "finance.ledger.view",
  invoices: "finance.invoices.view",
  categories: "finance.categories.view",
  customers: "finance.customers.view",
  articles: "finance.articles.view",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const requestedSection = (await searchParams).section ?? "overview";
  const section = financeSections.includes(
    requestedSection as (typeof financeSections)[number],
  )
    ? (requestedSection as (typeof financeSections)[number])
    : "overview";
  const actor = (await verifySession())!;
  const manager = hasOrganizationFinance(actor);
  const myFinance = canViewMyFinance(actor);
  const myTransactions = canViewMyTransactions(actor);
  const myInvoices = can(actor, "my.invoices");
  if (manager && !can(actor, sectionPermissions[section]))
    redirect(financeHome(actor)!);
  if (
    !manager &&
    ((section === "invoices" && !myInvoices) ||
      (section === "transactions" && !myTransactions) ||
      (section !== "invoices" && section !== "transactions" && !myFinance))
  )
    redirect("/unauthorized");
  const organizationLedger = can(actor, "finance.ledger.view");
  const organizationInvoices = can(actor, "finance.invoices.view");
  const visibleSection = manager
    ? section
    : section === "invoices" || section === "transactions"
      ? section
      : "overview";
  const { db } = getAdminServices();
  const organizationId = actor.organizationId;
  const [
    organizationSnapshot,
    usersSnapshot,
    categoriesSnapshot,
    invoicesSnapshot,
    transactionsSnapshot,
    customersSnapshot,
    vatSettlementsSnapshot,
    financeAttachmentsSnapshot,
    agreementsSnapshot,
  ] = await Promise.all([
    db.collection("organizations").doc(organizationId).get(),
    manager
      ? db
          .collection("users")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    db
      .collection("financeCategories")
      .where("organizationId", "==", organizationId)
      .get(),
    organizationLedger || organizationInvoices || myInvoices
      ? db
          .collection("invoices")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    organizationLedger || myFinance || myTransactions
      ? db
          .collection("financialTransactions")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    can(actor, "finance.customers.view")
      ? db
          .collection("financeCustomers")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    can(actor, "finance.vat.view")
      ? db
          .collection("vatSettlements")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    organizationLedger || myFinance || myTransactions || organizationInvoices
      ? db
          .collection("financeAttachments")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    organizationLedger
      ? db
          .collection("compensationAgreements")
          .where("organizationId", "==", organizationId)
          .where("model", "==", "hybrid")
          .get()
      : manager
        ? Promise.resolve(null)
        : db
            .collection("compensationAgreements")
            .where("organizationId", "==", organizationId)
            .where("userId", "==", actor.id)
            .get(),
  ]);
  const articlesSnapshot = can(actor, "finance.articles.view")
    ? await db
        .collection("invoiceArticles")
        .where("organizationId", "==", organizationId)
        .get()
    : null;
  const articles: FinancePageData["articles"] = (articlesSnapshot?.docs ?? [])
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        articleNumber: String(data.articleNumber ?? ""),
        description: String(data.description ?? ""),
        unit: String(data.unit ?? ""),
        unitPriceMinor: Number(data.unitPriceMinor ?? 0),
        consultantScope: String(data.consultantScope ?? "all"),
        vatRateBps: Number(data.vatRateBps ?? 0),
        validFrom: String(data.validFrom ?? ""),
        validTo: data.validTo ? String(data.validTo) : null,
      };
    })
    .sort(
      (a, b) =>
        a.articleNumber.localeCompare(b.articleNumber, "sv-SE", {
          numeric: true,
        }) || b.validFrom.localeCompare(a.validFrom),
    );
  const invoiceConsultantIds = new Map(
    (invoicesSnapshot?.docs ?? []).map((document) => [
      document.id,
      document.data().consultantId ?? null,
    ]),
  );

  const transactionAttachments = new Map<
    string,
    Array<{ id: string; name: string; contentType: string }>
  >();
  // Invoice files are for staff only; consultants never see them.
  const invoiceAttachments = new Map<
    string,
    Array<{ id: string; name: string; contentType: string }>
  >();
  for (const document of financeAttachmentsSnapshot?.docs ?? []) {
    const data = document.data();
    if (data.entityType === "invoice" && manager) {
      const files = invoiceAttachments.get(String(data.entityId)) ?? [];
      files.push({
        id: document.id,
        name: String(data.name),
        contentType: String(data.contentType),
      });
      invoiceAttachments.set(String(data.entityId), files);
      continue;
    }
    if (data.entityType !== "transaction") continue;
    const attachments = transactionAttachments.get(String(data.entityId)) ?? [];
    attachments.push({
      id: document.id,
      name: String(data.name),
      contentType: String(data.contentType),
    });
    transactionAttachments.set(String(data.entityId), attachments);
  }

  const users: FinancePageData["users"] = (usersSnapshot?.docs ?? [])
    .map((document) => ({
      id: document.id,
      displayName: String(document.data().displayName),
      employeeNumber: String(document.data().employeeNumber),
      role: String(document.data().role),
      compensationModel: document.data().compensationModel ?? null,
    }))
    .filter((user) => user.role === "consultant")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const categories: FinancePageData["categories"] = categoriesSnapshot.docs
    .map((document) => ({
      id: document.id,
      code: String(document.data().code),
      name: document.data().name as { en: string; sv: string },
      direction: document.data().direction as "income" | "expense",
      active: document.data().active !== false,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const invoices: FinancePageData["invoices"] = (
    organizationInvoices || myInvoices ? (invoicesSnapshot?.docs ?? []) : []
  )
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        invoiceNumber: String(data.invoiceNumber),
        consultantId: data.consultantId ?? null,
        compensationModel: data.compensationModel ?? null,
        customerName: String(data.customerName),
        customerContactPerson: manager
          ? String(data.customerContactPerson ?? "")
          : "",
        customerFinanceEmail: manager
          ? String(data.customerFinanceEmail ?? "")
          : "",
        visibleDescription: String(data.visibleDescription ?? ""),
        internalNote: manager ? String(data.internalNote ?? "") : "",
        vatRateBps: Number(data.vatRateBps ?? 0),
        issueDate: String(data.issueDate),
        dueDate: String(data.dueDate),
        periodFrom: data.periodFrom ?? null,
        periodTo: data.periodTo ?? null,
        paidDate: data.paidDate ?? null,
        status: data.status as "issued" | "paid" | "void",
        netMinor: Number(data.netMinor),
        vatMinor: Number(data.vatMinor),
        roundingMinor: Number(data.roundingMinor ?? 0),
        grossMinor: Number(data.grossMinor),
        shareBps: Number(data.shareBps ?? 0),
        customerId: manager ? String(data.customerId ?? "") : "",
        useGenerator: madeWithGenerator(data),
        attachments: invoiceAttachments.get(document.id) ?? [],
        ocrReference: manager ? (data.ocrReference ?? null) : null,
        pdfGeneratedAt: manager ? (data.pdfGeneratedAt ?? null) : null,
        sentAt: manager ? (data.sentAt ?? null) : null,
        sentTo: manager ? (data.sentTo ?? null) : null,
      };
    })
    .filter((invoice) => manager || invoice.consultantId === actor.id)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const transactions: FinancePageData["transactions"] = (
    transactionsSnapshot?.docs ?? []
  )
    .map((document) => {
      const data = document.data();
      const recordedBalanceDelta = Number(
        data.consultantBalanceDeltaMinor ?? 0,
      );
      const balanceDelta =
        data.consultantId === null &&
        data.invoiceAllocation === "company_share" &&
        recordedBalanceDelta === 0
          ? Number(data.netMinor)
          : recordedBalanceDelta;
      return {
        id: document.id,
        direction: data.direction as "income" | "expense",
        categoryId: String(data.categoryId),
        consultantId: data.consultantId ?? null,
        invoiceId: data.invoiceId ?? null,
        invoiceConsultantId: invoiceConsultantIds.get(data.invoiceId) ?? null,
        funding: data.funding ?? null,
        date: String(data.date),
        netMinor: Number(data.netMinor),
        vatRateBps: Number(data.vatRateBps ?? 0),
        vatMinor: Number(data.vatMinor),
        roundingMinor: Number(data.roundingMinor ?? 0),
        grossMinor: Number(data.grossMinor),
        consultantBalanceDeltaMinor: balanceDelta,
        visibleDescription: String(data.visibleDescription ?? ""),
        internalNote: manager ? String(data.internalNote ?? "") : "",
        applyConsultantShare: data.applyConsultantShare === true,
        shareBpsOverride: manager ? (data.shareBpsOverride ?? null) : null,
        status: data.status as "posted" | "reversal",
        reversedByTransactionId: data.reversedByTransactionId ?? null,
        createdAt: millis(data.createdAt),
        attachments: transactionAttachments.get(document.id) ?? [],
      };
    })
    .filter((transaction) => manager || transaction.consultantId === actor.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const agreements: FinancePageData["agreements"] = (
    agreementsSnapshot?.docs ?? []
  ).map((document) => ({
    id: document.id,
    userId: String(document.data().userId),
    model: document.data().model,
    validFrom: String(document.data().validFrom),
    validTo: document.data().validTo ?? null,
    shareBps: Number(document.data().shareBps ?? 0),
    fixedMonthlySalaryMinor: document.data().fixedMonthlySalaryMinor ?? null,
  }));
  const customers: FinancePageData["customers"] = (
    customersSnapshot?.docs ?? []
  )
    .map((document) => {
      const data = document.data();
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      return {
        id: document.id,
        name: String(data.name),
        contactPerson: String(data.contactPerson),
        financeEmail: String(data.financeEmail),
        customerNumber: text(data.customerNumber),
        orgNumber: text(data.orgNumber),
        vatNumber: text(data.vatNumber),
        addressLine: text(data.addressLine),
        postalCode: text(data.postalCode),
        city: text(data.city),
        country: text(data.country),
        defaultYourReference: text(data.defaultYourReference),
        paymentTermsDays: Number.isInteger(data.paymentTermsDays)
          ? Number(data.paymentTermsDays)
          : null,
        invoiceLocale: (data.invoiceLocale === "en-SE" ? "en-SE" : "sv-SE") as
          "en-SE" | "sv-SE",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const vatSettlements: FinancePageData["vatSettlements"] = (
    vatSettlementsSnapshot?.docs ?? []
  ).map((document) => ({
    id: document.id,
    paymentDate: String(document.data().paymentDate ?? ""),
    periodFrom: String(document.data().periodFrom ?? ""),
    periodTo: String(document.data().periodTo ?? ""),
    reference: String(document.data().reference ?? ""),
    amountMinor: Number(document.data().amountMinor ?? 0),
    roundingMinor: Number(document.data().roundingMinor ?? 0),
    status: document.data().status as "active" | "reversed",
  }));

  return (
    <FinanceDashboard
      data={{
        financeEnabled: organizationSnapshot.data()?.financeEnabled === true,
        users,
        customers,
        articles,
        paymentTermsDays: invoiceSettingsFrom(
          organizationSnapshot.data()?.invoicing,
        ).paymentTermsDays,
        categories,
        invoices,
        transactions,
        agreements,
        vatSettlements,
      }}
      actor={{
        id: actor.id,
        role: actor.role,
        locale: actor.locale,
        permissions: actor.permissions,
      }}
      section={visibleSection}
    />
  );
}
