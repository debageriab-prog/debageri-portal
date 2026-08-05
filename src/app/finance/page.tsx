import { redirect } from "next/navigation";
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
  "compensation",
  "invoices",
  "categories",
  "transactions",
  "customers",
] as const;

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
  const manager = ["admin", "accountant"].includes(actor.role);
  if (
    !manager &&
    ((section === "invoices" && !actor.financeAccess.myInvoices) ||
      (section !== "invoices" && !actor.financeAccess.myFinance))
  )
    redirect("/unauthorized");
  const visibleSection = manager
    ? section
    : section === "invoices"
      ? "invoices"
      : "overview";
  const { db } = getAdminServices();
  const organizationId = actor.organizationId;
  const [
    organizationSnapshot,
    usersSnapshot,
    categoriesSnapshot,
    invoicesSnapshot,
    transactionsSnapshot,
    agreementsSnapshot,
    customersSnapshot,
    vatSettlementsSnapshot,
    financeAttachmentsSnapshot,
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
    manager || actor.financeAccess.myInvoices
      ? db
          .collection("invoices")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    manager || actor.financeAccess.myFinance
      ? db
          .collection("financialTransactions")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    manager
      ? db
          .collection("compensationAgreements")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    manager
      ? db
          .collection("financeCustomers")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    manager
      ? db
          .collection("vatSettlements")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
    manager || actor.financeAccess.myFinance
      ? db
          .collection("financeAttachments")
          .where("organizationId", "==", organizationId)
          .get()
      : Promise.resolve(null),
  ]);

  const transactionAttachments = new Map<
    string,
    Array<{ id: string; name: string }>
  >();
  for (const document of financeAttachmentsSnapshot?.docs ?? []) {
    const data = document.data();
    if (data.entityType !== "transaction") continue;
    const attachments = transactionAttachments.get(String(data.entityId)) ?? [];
    attachments.push({ id: document.id, name: String(data.name) });
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
  const invoices: FinancePageData["invoices"] = (invoicesSnapshot?.docs ?? [])
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        invoiceNumber: String(data.invoiceNumber),
        consultantId: data.consultantId ?? null,
        customerName: String(data.customerName),
        issueDate: String(data.issueDate),
        dueDate: String(data.dueDate),
        paidDate: data.paidDate ?? null,
        status: data.status as "issued" | "paid" | "void",
        netMinor: Number(data.netMinor),
        vatMinor: Number(data.vatMinor),
        grossMinor: Number(data.grossMinor),
        shareBps: Number(data.shareBps ?? 0),
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
        funding: data.funding ?? null,
        date: String(data.date),
        netMinor: Number(data.netMinor),
        vatRateBps: Number(data.vatRateBps ?? 0),
        vatMinor: Number(data.vatMinor),
        grossMinor: Number(data.grossMinor),
        consultantBalanceDeltaMinor: balanceDelta,
        visibleDescription: String(data.visibleDescription ?? ""),
        internalNote: manager ? String(data.internalNote ?? "") : "",
        applyConsultantShare: data.applyConsultantShare === true,
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
  )
    .map((document) => ({
      id: document.id,
      userId: String(document.data().userId),
      model: document.data().model as "flexible" | "fixed",
      validFrom: String(document.data().validFrom),
      validTo: document.data().validTo ?? null,
      shareBps: Number(document.data().shareBps ?? 0),
      fixedMonthlySalaryMinor: document.data().fixedMonthlySalaryMinor ?? null,
    }))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const customers: FinancePageData["customers"] = (
    customersSnapshot?.docs ?? []
  )
    .map((document) => ({
      id: document.id,
      name: String(document.data().name),
      contactPerson: String(document.data().contactPerson),
      financeEmail: String(document.data().financeEmail),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const vatSettlements: FinancePageData["vatSettlements"] = (
    vatSettlementsSnapshot?.docs ?? []
  ).map((document) => ({
    id: document.id,
    amountMinor: Number(document.data().amountMinor ?? 0),
    status: document.data().status as "active" | "reversed",
  }));

  return (
    <FinanceDashboard
      data={{
        financeEnabled: organizationSnapshot.data()?.financeEnabled === true,
        users,
        customers,
        categories,
        invoices,
        transactions,
        agreements,
        vatSettlements,
      }}
      actor={{ id: actor.id, role: actor.role, locale: actor.locale }}
      section={visibleSection}
    />
  );
}
