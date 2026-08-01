import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { PortalUser } from "@/domain/types";
import {
  allocateInvoiceIncome,
  calculateShareMinor,
  calculateVatMinor,
} from "@/domain/finance/calculations";

export class FinanceError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function requireFinanceManager(actor: PortalUser) {
  if (!["admin", "accountant"].includes(actor.role))
    throw new FinanceError("forbidden", 403);
}

async function activeAgreement(
  db: Firestore,
  organizationId: string,
  userId: string,
  date: string,
) {
  const snapshot = await db
    .collection("compensationAgreements")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("validFrom", "<=", date)
    .orderBy("validFrom", "desc")
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  const data = document?.data();
  if (!document || (data?.validTo && data.validTo < date))
    throw new FinanceError("compensationMissing", 409);
  return { id: document.id, ...data } as {
    id: string;
    model: "flexible" | "fixed";
    shareBps: number;
    validFrom: string;
    validTo: string | null;
  };
}

function audit(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  actor: PortalUser,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType,
    entityId,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  });
}

function previousDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export async function enableFinance(db: Firestore, actor: PortalUser) {
  if (actor.role !== "admin") throw new FinanceError("forbidden", 403);
  const existingCategories = await db
    .collection("financeCategories")
    .where("organizationId", "==", actor.organizationId)
    .limit(1)
    .get();
  const batch = db.batch();
  batch.update(db.collection("organizations").doc(actor.organizationId), {
    financeEnabled: true,
    financeEnabledAt: FieldValue.serverTimestamp(),
    financeEnabledBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "finance.enabled",
    "organization",
    actor.organizationId,
  );
  if (existingCategories.empty) {
    const defaults = [
      ["assignment_income", "Assignment income", "Uppdragsintäkt", "income"],
      ["other_income", "Other income", "Övrig intäkt", "income"],
      ["salary", "Salary", "Lön", "expense"],
      ["bonus", "Bonus", "Bonus", "expense"],
      ["salary_tax", "Salary tax", "Löneskatt", "expense"],
      ["bonus_tax", "Bonus tax", "Bonusskatt", "expense"],
      [
        "employer_tax",
        "Employer contributions",
        "Arbetsgivaravgifter",
        "expense",
      ],
      ["insurance", "Insurance", "Försäkring", "expense"],
      ["equipment", "Equipment", "Utrustning", "expense"],
      ["other_expense", "Other expense", "Övrig kostnad", "expense"],
    ] as const;
    defaults.forEach(([code, en, sv, direction]) => {
      batch.create(db.collection("financeCategories").doc(), {
        organizationId: actor.organizationId,
        code,
        name: { en, sv },
        direction,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.id,
      });
    });
  }
  await batch.commit();
}

export async function setCompensation(
  db: Firestore,
  actor: PortalUser,
  input: {
    userId: string;
    model: "flexible" | "fixed";
    validFrom: string;
    validTo: string | null;
    shareBps: number;
    fixedMonthlySalaryMinor: number | null;
  },
) {
  if (actor.role !== "admin") throw new FinanceError("forbidden", 403);
  const user = await db.collection("users").doc(input.userId).get();
  if (
    !user.exists ||
    user.data()?.organizationId !== actor.organizationId ||
    user.data()?.role !== "consultant"
  )
    throw new FinanceError("consultantInvalid", 404);
  if (input.model === "flexible" && input.fixedMonthlySalaryMinor !== null)
    throw new FinanceError("compensationInvalid");
  if (input.validTo && input.validTo < input.validFrom)
    throw new FinanceError("compensationInvalid");
  if (
    input.model === "fixed" &&
    (input.shareBps !== 0 ||
      input.fixedMonthlySalaryMinor === null ||
      input.fixedMonthlySalaryMinor <= 0)
  )
    throw new FinanceError("compensationInvalid");

  const existing = await db
    .collection("compensationAgreements")
    .where("organizationId", "==", actor.organizationId)
    .where("userId", "==", input.userId)
    .orderBy("validFrom", "desc")
    .limit(1)
    .get();
  const latest = existing.docs[0];
  if (latest && latest.data().validFrom >= input.validFrom)
    throw new FinanceError("compensationDateConflict", 409);
  if (latest?.data().validTo && latest.data().validTo >= input.validFrom)
    throw new FinanceError("compensationDateConflict", 409);

  const ref = db.collection("compensationAgreements").doc();
  const batch = db.batch();
  if (latest && latest.data().validTo === null)
    batch.update(latest.ref, {
      validTo: previousDay(input.validFrom),
      updatedAt: FieldValue.serverTimestamp(),
    });
  batch.create(ref, {
    organizationId: actor.organizationId,
    userId: input.userId,
    model: input.model,
    validFrom: input.validFrom,
    validTo: input.validTo,
    shareBps: input.model === "flexible" ? input.shareBps : 0,
    fixedMonthlySalaryMinor:
      input.model === "fixed" ? input.fixedMonthlySalaryMinor : null,
    currency: "SEK",
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
  });
  batch.update(user.ref, {
    compensationModel: input.model,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(
    db,
    batch,
    actor,
    "compensation.created",
    "compensationAgreement",
    ref.id,
    {
      userId: input.userId,
      model: input.model,
      validFrom: input.validFrom,
      shareBps: input.model === "flexible" ? input.shareBps : 0,
    },
  );
  await batch.commit();
  return ref.id;
}

export async function setCompensationValidTo(
  db: Firestore,
  actor: PortalUser,
  input: { agreementId: string; validTo: string },
) {
  if (actor.role !== "admin") throw new FinanceError("forbidden", 403);
  const reference = db
    .collection("compensationAgreements")
    .doc(input.agreementId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("compensationMissing", 404);
  if (data.validTo !== null || input.validTo < data.validFrom)
    throw new FinanceError("compensationInvalid", 409);
  const batch = db.batch();
  batch.update(reference, {
    validTo: input.validTo,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "compensation.validToSet",
    "compensationAgreement",
    reference.id,
    { validTo: input.validTo },
  );
  await batch.commit();
}

export async function createCustomer(
  db: Firestore,
  actor: PortalUser,
  input: { name: string; contactPerson: string; financeEmail: string },
) {
  requireFinanceManager(actor);
  const duplicate = await db
    .collection("financeCustomers")
    .where("organizationId", "==", actor.organizationId)
    .where("name", "==", input.name)
    .limit(1)
    .get();
  if (!duplicate.empty) throw new FinanceError("customerDuplicate", 409);
  const reference = db.collection("financeCustomers").doc();
  const batch = db.batch();
  batch.create(reference, {
    organizationId: actor.organizationId,
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(
    db,
    batch,
    actor,
    "financeCustomer.created",
    "financeCustomer",
    reference.id,
  );
  await batch.commit();
  return reference.id;
}

export async function updateCustomer(
  db: Firestore,
  actor: PortalUser,
  input: {
    customerId: string;
    name: string;
    contactPerson: string;
    financeEmail: string;
  },
) {
  requireFinanceManager(actor);
  const reference = db.collection("financeCustomers").doc(input.customerId);
  const snapshot = await reference.get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    throw new FinanceError("customerInvalid", 404);
  const duplicate = await db
    .collection("financeCustomers")
    .where("organizationId", "==", actor.organizationId)
    .where("name", "==", input.name)
    .limit(2)
    .get();
  if (duplicate.docs.some((document) => document.id !== input.customerId))
    throw new FinanceError("customerDuplicate", 409);
  const batch = db.batch();
  batch.update(reference, {
    name: input.name,
    contactPerson: input.contactPerson,
    financeEmail: input.financeEmail,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "financeCustomer.updated",
    "financeCustomer",
    reference.id,
  );
  await batch.commit();
}

export async function updateCategory(
  db: Firestore,
  actor: PortalUser,
  input: {
    categoryId: string;
    nameEn: string;
    nameSv: string;
    active: boolean;
  },
) {
  if (actor.role !== "admin") throw new FinanceError("forbidden", 403);
  const reference = db.collection("financeCategories").doc(input.categoryId);
  const snapshot = await reference.get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    throw new FinanceError("categoryInvalid", 404);
  const batch = db.batch();
  batch.update(reference, {
    name: { en: input.nameEn, sv: input.nameSv },
    active: input.active,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "financeCategory.updated",
    "financeCategory",
    reference.id,
    {
      active: input.active,
    },
  );
  await batch.commit();
}

export async function createCategory(
  db: Firestore,
  actor: PortalUser,
  input: {
    code: string;
    nameEn: string;
    nameSv: string;
    direction: "income" | "expense";
  },
) {
  if (actor.role !== "admin") throw new FinanceError("forbidden", 403);
  const duplicate = await db
    .collection("financeCategories")
    .where("organizationId", "==", actor.organizationId)
    .where("code", "==", input.code)
    .limit(1)
    .get();
  if (!duplicate.empty) throw new FinanceError("categoryDuplicate", 409);
  const ref = db.collection("financeCategories").doc();
  const batch = db.batch();
  batch.create(ref, {
    organizationId: actor.organizationId,
    code: input.code,
    name: { en: input.nameEn, sv: input.nameSv },
    direction: input.direction,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "financeCategory.created",
    "financeCategory",
    ref.id,
    {
      code: input.code,
      direction: input.direction,
    },
  );
  await batch.commit();
  return ref.id;
}

export async function createInvoice(
  db: Firestore,
  actor: PortalUser,
  input: {
    invoiceNumber: string;
    consultantId: string | null;
    customerId: string;
    issueDate: string;
    dueDate: string;
    netMinor: number;
    vatRateBps: number;
    visibleDescription: string;
    internalNote: string;
    shareBpsOverride: number | null;
    importKey?: string | null;
  },
) {
  requireFinanceManager(actor);
  if (input.dueDate < input.issueDate)
    throw new FinanceError("invoiceDateInvalid");
  const duplicate = await db
    .collection("invoices")
    .where("organizationId", "==", actor.organizationId)
    .where("invoiceNumber", "==", input.invoiceNumber)
    .limit(1)
    .get();
  if (!duplicate.empty) throw new FinanceError("invoiceDuplicate", 409);

  const customer = await db
    .collection("financeCustomers")
    .doc(input.customerId)
    .get();
  const customerData = customer.data();
  if (!customer.exists || customerData?.organizationId !== actor.organizationId)
    throw new FinanceError("customerInvalid", 404);

  let model: "flexible" | "fixed" | null = null;
  let shareBps = 0;
  if (input.consultantId) {
    const user = await db.collection("users").doc(input.consultantId).get();
    if (
      !user.exists ||
      user.data()?.organizationId !== actor.organizationId ||
      user.data()?.role !== "consultant"
    )
      throw new FinanceError("consultantInvalid", 404);
    const agreement = await activeAgreement(
      db,
      actor.organizationId,
      input.consultantId,
      input.issueDate,
    );
    model = agreement.model;
    shareBps =
      model === "flexible" ? (input.shareBpsOverride ?? agreement.shareBps) : 0;
  }
  const vatMinor = calculateVatMinor(input.netMinor, input.vatRateBps);
  const ref = db.collection("invoices").doc();
  const batch = db.batch();
  batch.create(ref, {
    organizationId: actor.organizationId,
    ...input,
    customerName: customerData.name,
    customerContactPerson: customerData.contactPerson,
    customerFinanceEmail: customerData.financeEmail,
    currency: "SEK",
    vatMinor,
    grossMinor: input.netMinor + vatMinor,
    compensationModel: model,
    shareBps,
    status: "issued",
    paidDate: null,
    incomeTransactionId: null,
    incomeTransactionIds: [],
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
    importKey: input.importKey ?? null,
  });
  audit(db, batch, actor, "invoice.created", "invoice", ref.id, {
    invoiceNumber: input.invoiceNumber,
    consultantId: input.consultantId,
    netMinor: input.netMinor,
  });
  await batch.commit();
  return ref.id;
}

export async function markInvoicePaid(
  db: Firestore,
  actor: PortalUser,
  input: { invoiceId: string; paidDate: string; categoryId: string },
) {
  requireFinanceManager(actor);
  const invoiceRef = db.collection("invoices").doc(input.invoiceId);
  const categoryRef = db.collection("financeCategories").doc(input.categoryId);
  const companyTransactionRef = db.collection("financialTransactions").doc();
  const consultantTransactionRef = db.collection("financialTransactions").doc();
  await db.runTransaction(async (transaction) => {
    const [invoice, category] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(categoryRef),
    ]);
    const data = invoice.data();
    if (!invoice.exists || data?.organizationId !== actor.organizationId)
      throw new FinanceError("invoiceMissing", 404);
    if (data.status !== "issued")
      throw new FinanceError("invoiceNotPayable", 409);
    if (
      !category.exists ||
      category.data()?.organizationId !== actor.organizationId ||
      category.data()?.direction !== "income"
    )
      throw new FinanceError("categoryInvalid");
    if (input.paidDate < data.issueDate)
      throw new FinanceError("invoiceDateInvalid");
    const allocation = allocateInvoiceIncome(
      data.netMinor,
      data.compensationModel ?? null,
      data.shareBps ?? 0,
    );
    const shared = {
      organizationId: actor.organizationId,
      direction: "income",
      categoryId: input.categoryId,
      invoiceId: invoice.id,
      date: input.paidDate,
      currency: "SEK",
      funding: null,
      visibleDescription: data.visibleDescription ?? "",
      internalNote: data.internalNote ?? "",
      status: "posted",
      reversesTransactionId: null,
      reversedByTransactionId: null,
      importKey: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    };
    transaction.create(companyTransactionRef, {
      ...shared,
      consultantId: null,
      netMinor: allocation.companyMinor,
      vatRateBps: data.vatRateBps,
      vatMinor: data.vatMinor,
      grossMinor: allocation.companyMinor + data.vatMinor,
      consultantBalanceDeltaMinor: allocation.companyMinor,
      invoiceAllocation: "company_share",
    });
    const transactionIds = [companyTransactionRef.id];
    if (
      data.consultantId &&
      data.compensationModel === "flexible" &&
      allocation.consultantMinor > 0
    ) {
      transaction.create(consultantTransactionRef, {
        ...shared,
        consultantId: data.consultantId,
        netMinor: allocation.consultantMinor,
        vatRateBps: 0,
        vatMinor: 0,
        grossMinor: allocation.consultantMinor,
        consultantBalanceDeltaMinor: allocation.consultantMinor,
        invoiceAllocation: "consultant_share",
      });
      transactionIds.push(consultantTransactionRef.id);
    }
    transaction.update(invoiceRef, {
      status: "paid",
      paidDate: input.paidDate,
      incomeTransactionId: companyTransactionRef.id,
      incomeTransactionIds: transactionIds,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "invoice.paid",
      entityType: "invoice",
      entityId: invoice.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        transactionIds,
        companyIncomeMinor: allocation.companyMinor,
        consultantIncomeMinor: allocation.consultantMinor,
      },
    });
  });
  return companyTransactionRef.id;
}

export async function createFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: {
    direction: "income" | "expense";
    categoryId: string;
    consultantId: string | null;
    date: string;
    netMinor: number;
    vatRateBps: number;
    funding: "company" | "consultant" | null;
    applyConsultantShare: boolean;
    visibleDescription: string;
    internalNote: string;
    importKey: string | null;
  },
) {
  requireFinanceManager(actor);
  const category = await db
    .collection("financeCategories")
    .doc(input.categoryId)
    .get();
  if (
    !category.exists ||
    category.data()?.organizationId !== actor.organizationId ||
    category.data()?.direction !== input.direction
  )
    throw new FinanceError("categoryInvalid");
  if (input.importKey) {
    const duplicate = await db
      .collection("financialTransactions")
      .where("organizationId", "==", actor.organizationId)
      .where("importKey", "==", input.importKey)
      .limit(1)
      .get();
    if (!duplicate.empty) throw new FinanceError("importDuplicate", 409);
  }

  let balanceDelta = 0;
  if (input.consultantId) {
    const user = await db.collection("users").doc(input.consultantId).get();
    if (
      !user.exists ||
      user.data()?.organizationId !== actor.organizationId ||
      user.data()?.role !== "consultant"
    )
      throw new FinanceError("consultantInvalid", 404);
    const agreement = await activeAgreement(
      db,
      actor.organizationId,
      input.consultantId,
      input.date,
    );
    if (agreement.model === "flexible") {
      if (input.direction === "income" && input.applyConsultantShare)
        balanceDelta = calculateShareMinor(input.netMinor, agreement.shareBps);
      if (input.direction === "expense" && input.funding === "consultant")
        balanceDelta = -input.netMinor;
    }
  }
  if (!input.consultantId)
    balanceDelta =
      input.direction === "income" ? input.netMinor : -input.netMinor;
  if (input.direction === "expense" && !input.funding)
    throw new FinanceError("fundingRequired");
  const vatMinor = calculateVatMinor(input.netMinor, input.vatRateBps);
  const ref = db.collection("financialTransactions").doc();
  const batch = db.batch();
  batch.create(ref, {
    organizationId: actor.organizationId,
    ...input,
    currency: "SEK",
    vatMinor,
    grossMinor: input.netMinor + vatMinor,
    invoiceId: null,
    consultantBalanceDeltaMinor: balanceDelta,
    status: "posted",
    reversesTransactionId: null,
    reversedByTransactionId: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "financialTransaction.created",
    "financialTransaction",
    ref.id,
    {
      direction: input.direction,
      consultantId: input.consultantId,
      netMinor: input.netMinor,
      balanceDelta,
    },
  );
  await batch.commit();
  return ref.id;
}

export async function createExpenseCopies(
  db: Firestore,
  actor: PortalUser,
  input: {
    consultantId: string | null;
    expenses: Array<{
      categoryId: string;
      date: string;
      netMinor: number;
      vatRateBps: number;
      funding: "company" | "consultant";
      visibleDescription: string;
      internalNote: string;
    }>;
  },
) {
  requireFinanceManager(actor);
  const categoryIds = [
    ...new Set(input.expenses.map((item) => item.categoryId)),
  ];
  const categoryDocuments = await Promise.all(
    categoryIds.map((categoryId) =>
      db.collection("financeCategories").doc(categoryId).get(),
    ),
  );
  if (
    categoryDocuments.some(
      (category) =>
        !category.exists ||
        category.data()?.organizationId !== actor.organizationId ||
        category.data()?.direction !== "expense" ||
        category.data()?.active === false,
    )
  )
    throw new FinanceError("categoryInvalid");

  const agreementsByDate = new Map<
    string,
    Awaited<ReturnType<typeof activeAgreement>>
  >();
  if (input.consultantId) {
    const consultant = await db
      .collection("users")
      .doc(input.consultantId)
      .get();
    if (
      !consultant.exists ||
      consultant.data()?.organizationId !== actor.organizationId ||
      consultant.data()?.role !== "consultant"
    )
      throw new FinanceError("consultantInvalid", 404);
    const agreementDates = [
      ...new Set(input.expenses.map((item) => item.date)),
    ];
    const agreements = await Promise.all(
      agreementDates.map((date) =>
        activeAgreement(db, actor.organizationId, input.consultantId!, date),
      ),
    );
    agreementDates.forEach((date, index) =>
      agreementsByDate.set(date, agreements[index]!),
    );
  }

  const batch = db.batch();
  const ids: string[] = [];
  for (const expense of input.expenses) {
    const consultantModel = agreementsByDate.get(expense.date)?.model ?? null;
    const balanceDelta = input.consultantId
      ? consultantModel === "flexible" && expense.funding === "consultant"
        ? -expense.netMinor
        : 0
      : -expense.netMinor;
    const vatMinor = calculateVatMinor(expense.netMinor, expense.vatRateBps);
    const reference = db.collection("financialTransactions").doc();
    ids.push(reference.id);
    batch.create(reference, {
      organizationId: actor.organizationId,
      direction: "expense",
      categoryId: expense.categoryId,
      consultantId: input.consultantId,
      invoiceId: null,
      date: expense.date,
      currency: "SEK",
      netMinor: expense.netMinor,
      vatRateBps: expense.vatRateBps,
      vatMinor,
      grossMinor: expense.netMinor + vatMinor,
      funding: expense.funding,
      applyConsultantShare: false,
      consultantBalanceDeltaMinor: balanceDelta,
      visibleDescription: expense.visibleDescription,
      internalNote: expense.internalNote,
      status: "posted",
      reversesTransactionId: null,
      reversedByTransactionId: null,
      importKey: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
  }
  audit(
    db,
    batch,
    actor,
    "financialExpenses.copied",
    "financialTransactionBatch",
    ids[0]!,
    { transactionIds: ids, consultantId: input.consultantId },
  );
  await batch.commit();
  return ids[0];
}

export async function voidFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: { transactionId: string; reason: string },
) {
  requireFinanceManager(actor);
  const originalRef = db
    .collection("financialTransactions")
    .doc(input.transactionId);
  const reversalRef = db.collection("financialTransactions").doc();
  await db.runTransaction(async (transaction) => {
    const original = await transaction.get(originalRef);
    const data = original.data();
    if (!original.exists || data?.organizationId !== actor.organizationId)
      throw new FinanceError("transactionMissing", 404);
    if (data.reversedByTransactionId || data.status === "reversal")
      throw new FinanceError("transactionAlreadyReversed", 409);
    transaction.create(reversalRef, {
      ...data,
      netMinor: -data.netMinor,
      vatMinor: -data.vatMinor,
      grossMinor: -data.grossMinor,
      consultantBalanceDeltaMinor: -data.consultantBalanceDeltaMinor,
      status: "reversal",
      reversesTransactionId: original.id,
      reversedByTransactionId: null,
      visibleDescription: input.reason,
      internalNote: input.reason,
      importKey: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
    transaction.update(originalRef, {
      reversedByTransactionId: reversalRef.id,
      reversedAt: FieldValue.serverTimestamp(),
      reversedBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "financialTransaction.reversed",
      entityType: "financialTransaction",
      entityId: original.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { reversalId: reversalRef.id, reason: input.reason },
    });
  });
  return reversalRef.id;
}

export async function voidInvoice(
  db: Firestore,
  actor: PortalUser,
  input: { invoiceId: string; reason: string },
) {
  requireFinanceManager(actor);
  const reference = db.collection("invoices").doc(input.invoiceId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("invoiceMissing", 404);
  if (data.status === "void") throw new FinanceError("invoiceAlreadyVoid", 409);
  if (data.status === "paid") {
    const transactionIds: string[] = Array.isArray(data.incomeTransactionIds)
      ? data.incomeTransactionIds
      : data.incomeTransactionId
        ? [data.incomeTransactionId]
        : [];
    for (const transactionId of transactionIds)
      await voidFinancialTransaction(db, actor, {
        transactionId,
        reason: input.reason,
      });
  }
  const batch = db.batch();
  batch.update(reference, {
    status: "void",
    voidReason: input.reason,
    voidedAt: FieldValue.serverTimestamp(),
    voidedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(db, batch, actor, "invoice.voided", "invoice", reference.id, {
    reason: input.reason,
    previousStatus: data.status,
  });
  await batch.commit();
}
