import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { can, type PermissionKey } from "@/domain/access/permissions";
import type { CompensationModel, PortalUser } from "@/domain/types";
import {
  allocateInvoiceIncome,
  calculateShareMinor,
  calculateVatMinor,
  earnsInvoiceShare,
  vatPayableMinor,
} from "@/domain/finance/calculations";
import {
  COMPENSATION_END_CONFIRMATION,
  previousDay,
} from "@/domain/finance/compensation";
import { validInvoicePeriod } from "@/domain/finance/invoice-period";
import {
  invoiceSettingsFrom,
  nextNumberAfter,
} from "@/domain/finance/invoice-settings";
import {
  invoiceTotals,
  withLineAmount,
  type InvoiceLine,
} from "@/domain/finance/invoice-lines";
import {
  ARTICLE_FOR_ALL,
  ARTICLE_FOR_COMPANY,
  articleAppliesTo,
  articleValidOn,
  validityOverlaps,
} from "@/domain/finance/invoice-articles";
import {
  formatOrgNumber,
  ocrReferenceFor,
  validOrgNumber,
} from "@/domain/finance/swedish-identifiers";

export class FinanceError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function requireFinancePermission(
  actor: PortalUser,
  key: PermissionKey,
) {
  if (!can(actor, key)) throw new FinanceError("forbidden", 403);
}

export async function financeIsEnabled(db: Firestore, organizationId: string) {
  const organization = await db
    .collection("organizations")
    .doc(organizationId)
    .get();
  return organization.data()?.financeEnabled === true;
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
    model: CompensationModel;
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
    model: CompensationModel;
    validFrom: string;
    validTo: string | null;
    shareBps: number;
    fixedMonthlySalaryMinor: number | null;
    confirmation?: typeof COMPENSATION_END_CONFIRMATION;
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
  if (
    input.model === "hybrid" &&
    (input.shareBps <= 0 ||
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
  const openAgreement = latest?.data().validTo === null ? latest : null;
  if (openAgreement && input.confirmation !== COMPENSATION_END_CONFIRMATION)
    throw new FinanceError("compensationConfirmationRequired", 409);

  const ref = db.collection("compensationAgreements").doc();
  const batch = db.batch();
  if (openAgreement)
    batch.update(openAgreement.ref, {
      validTo: previousDay(input.validFrom),
      updatedAt: FieldValue.serverTimestamp(),
    });
  batch.create(ref, {
    organizationId: actor.organizationId,
    userId: input.userId,
    model: input.model,
    validFrom: input.validFrom,
    validTo: input.validTo,
    shareBps: earnsInvoiceShare(input.model) ? input.shareBps : 0,
    fixedMonthlySalaryMinor:
      input.model === "flexible" ? null : input.fixedMonthlySalaryMinor,
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
      shareBps: earnsInvoiceShare(input.model) ? input.shareBps : 0,
      ...(openAgreement ? { endedAgreementId: openAgreement.id } : {}),
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

export type CustomerInput = {
  name: string;
  contactPerson: string;
  financeEmail: string;
  customerNumber: string;
  orgNumber: string;
  vatNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  defaultYourReference: string;
  paymentTermsDays: number | null;
  invoiceLocale: "sv-SE" | "en-SE";
};

function customerFields(input: CustomerInput) {
  return {
    name: input.name,
    contactPerson: input.contactPerson,
    financeEmail: input.financeEmail,
    orgNumber: input.orgNumber
      ? validOrgNumber(input.orgNumber)
        ? formatOrgNumber(input.orgNumber)
        : input.orgNumber
      : "",
    vatNumber: input.vatNumber.replace(/\s/g, "").toUpperCase(),
    addressLine: input.addressLine,
    postalCode: input.postalCode,
    city: input.city,
    country: input.country,
    defaultYourReference: input.defaultYourReference,
    paymentTermsDays: input.paymentTermsDays,
    invoiceLocale: input.invoiceLocale,
  };
}

async function customerNumberTaken(
  db: Firestore,
  organizationId: string,
  customerNumber: string,
  exceptId?: string,
) {
  if (!customerNumber) return false;
  const snapshot = await db
    .collection("financeCustomers")
    .where("organizationId", "==", organizationId)
    .where("customerNumber", "==", customerNumber)
    .limit(2)
    .get();
  return snapshot.docs.some((document) => document.id !== exceptId);
}

export async function createCustomer(
  db: Firestore,
  actor: PortalUser,
  input: CustomerInput,
) {
  requireFinancePermission(actor, "finance.customers.add");
  const duplicate = await db
    .collection("financeCustomers")
    .where("organizationId", "==", actor.organizationId)
    .where("name", "==", input.name)
    .limit(1)
    .get();
  if (!duplicate.empty) throw new FinanceError("customerDuplicate", 409);
  if (await customerNumberTaken(db, actor.organizationId, input.customerNumber))
    throw new FinanceError("customerNumberDuplicate", 409);
  const reference = db.collection("financeCustomers").doc();
  const organization = db.collection("organizations").doc(actor.organizationId);
  await db.runTransaction(async (transaction) => {
    const settings = invoiceSettingsFrom(
      (await transaction.get(organization)).data()?.invoicing,
    );
    const customerNumber =
      input.customerNumber || String(settings.nextCustomerNumber);
    transaction.set(
      organization,
      {
        invoicing: {
          nextCustomerNumber: nextNumberAfter(
            settings.nextCustomerNumber,
            customerNumber,
          ),
        },
      },
      { merge: true },
    );
    transaction.create(reference, {
      organizationId: actor.organizationId,
      ...customerFields(input),
      customerNumber,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "financeCustomer.created",
      entityType: "financeCustomer",
      entityId: reference.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { customerNumber },
    });
  });
  return reference.id;
}

export async function updateCustomer(
  db: Firestore,
  actor: PortalUser,
  input: CustomerInput & { customerId: string },
) {
  requireFinancePermission(actor, "finance.customers.edit");
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
  const customerNumber =
    input.customerNumber || String(snapshot.data()?.customerNumber ?? "");
  if (
    await customerNumberTaken(
      db,
      actor.organizationId,
      customerNumber,
      input.customerId,
    )
  )
    throw new FinanceError("customerNumberDuplicate", 409);
  const batch = db.batch();
  batch.update(reference, {
    ...customerFields(input),
    customerNumber,
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
  requireFinancePermission(actor, "finance.categories.edit");
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
  requireFinancePermission(actor, "finance.categories.add");
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

export type ArticleInput = {
  articleNumber: string;
  description: string;
  unit: string;
  unitPriceMinor: number;
  consultantScope: string;
  vatRateBps: number;
  validFrom: string;
  validTo: string | null;
};

/**
 * Checks an article's consultant and that no other article with the same
 * number and consultant scope is valid on any of the same days.
 */
async function checkArticle(
  db: Firestore,
  actor: PortalUser,
  input: ArticleInput,
  exceptId?: string,
) {
  if (input.validTo && input.validTo < input.validFrom)
    throw new FinanceError("articleDatesInvalid");
  if (
    input.consultantScope !== ARTICLE_FOR_ALL &&
    input.consultantScope !== ARTICLE_FOR_COMPANY
  ) {
    const user = await db.collection("users").doc(input.consultantScope).get();
    if (
      !user.exists ||
      user.data()?.organizationId !== actor.organizationId ||
      user.data()?.role !== "consultant"
    )
      throw new FinanceError("consultantInvalid", 404);
  }
  const sameNumber = await db
    .collection("invoiceArticles")
    .where("organizationId", "==", actor.organizationId)
    .where("articleNumber", "==", input.articleNumber)
    .get();
  if (
    sameNumber.docs.some(
      (document) =>
        document.id !== exceptId &&
        document.data().consultantScope === input.consultantScope &&
        validityOverlaps(
          {
            validFrom: String(document.data().validFrom),
            validTo: document.data().validTo ?? null,
          },
          input,
        ),
    )
  )
    throw new FinanceError("articleOverlap", 409);
}

export async function createInvoiceArticle(
  db: Firestore,
  actor: PortalUser,
  input: ArticleInput,
) {
  requireFinancePermission(actor, "finance.articles.add");
  await checkArticle(db, actor, input);
  const reference = db.collection("invoiceArticles").doc();
  const batch = db.batch();
  batch.create(reference, {
    organizationId: actor.organizationId,
    ...articleFields(input),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(
    db,
    batch,
    actor,
    "invoiceArticle.created",
    "invoiceArticle",
    reference.id,
    {
      articleNumber: input.articleNumber,
      unitPriceMinor: input.unitPriceMinor,
    },
  );
  await batch.commit();
  return reference.id;
}

/**
 * Changes an article. Invoices keep the copy of the details they were
 * saved with, so this only affects new and edited invoices.
 */
export async function updateInvoiceArticle(
  db: Firestore,
  actor: PortalUser,
  input: ArticleInput & { articleId: string },
) {
  requireFinancePermission(actor, "finance.articles.edit");
  const reference = db.collection("invoiceArticles").doc(input.articleId);
  const snapshot = await reference.get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    throw new FinanceError("articleMissing", 404);
  await checkArticle(db, actor, input, input.articleId);
  const batch = db.batch();
  batch.update(reference, {
    ...articleFields(input),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "invoiceArticle.updated",
    "invoiceArticle",
    reference.id,
    {
      articleNumber: input.articleNumber,
      unitPriceMinor: input.unitPriceMinor,
      previousUnitPriceMinor: snapshot.data()?.unitPriceMinor ?? null,
    },
  );
  await batch.commit();
}

function articleFields(input: ArticleInput) {
  return {
    articleNumber: input.articleNumber,
    description: input.description,
    unit: input.unit,
    unitPriceMinor: input.unitPriceMinor,
    consultantScope: input.consultantScope,
    vatRateBps: input.vatRateBps,
    validFrom: input.validFrom,
    validTo: input.validTo,
  };
}

/**
 * Rows made from an article take its number, description, unit and price
 * as they are on the server, and the article must suit the invoice: right
 * consultant, valid on the invoice date and with the invoice's VAT rate.
 */
async function resolvedLines(
  db: Firestore,
  actor: PortalUser,
  lines: Array<Omit<InvoiceLine, "amountMinor">>,
  invoice: {
    consultantId: string | null;
    issueDate: string;
    vatRateBps: number;
  },
) {
  const ids = [
    ...new Set(lines.map((line) => line.articleId).filter(Boolean)),
  ] as string[];
  if (!ids.length)
    return lines.map((line) => withLineAmount({ ...line, articleId: null }));
  const snapshots = await db.getAll(
    ...ids.map((id) => db.collection("invoiceArticles").doc(id)),
  );
  const articles = new Map(
    snapshots
      .filter(
        (snapshot) =>
          snapshot.exists &&
          snapshot.data()?.organizationId === actor.organizationId,
      )
      .map((snapshot) => [snapshot.id, snapshot.data()!]),
  );
  return lines.map((line) => {
    if (!line.articleId) return withLineAmount({ ...line, articleId: null });
    const article = articles.get(line.articleId);
    if (!article) throw new FinanceError("articleMissing", 404);
    const range = {
      validFrom: String(article.validFrom),
      validTo: article.validTo ?? null,
    };
    if (
      !articleAppliesTo(
        { consultantScope: String(article.consultantScope) },
        invoice.consultantId,
      ) ||
      !articleValidOn(range, invoice.issueDate)
    )
      throw new FinanceError("invoiceArticleNotApplicable", 409);
    if (Number(article.vatRateBps) !== invoice.vatRateBps)
      throw new FinanceError("invoiceArticleVatMismatch", 409);
    return withLineAmount({
      articleId: line.articleId,
      articleNumber: String(article.articleNumber),
      description: String(article.description),
      quantityThousandths: line.quantityThousandths,
      unit: String(article.unit),
      unitPriceMinor: Number(article.unitPriceMinor),
    });
  });
}

export type InvoiceInput = {
  invoiceNumber: string;
  consultantId: string | null;
  customerId: string;
  issueDate: string;
  dueDate: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  /** Used when there are no `lines`; otherwise the rows make the net. */
  netMinor: number;
  vatRateBps: number;
  /** Öresavrundning, included in the invoice total. */
  roundingMinor?: number;
  visibleDescription: string;
  internalNote: string;
  shareBpsOverride: number | null;
  importKey?: string | null;
  lines?: Array<Omit<InvoiceLine, "amountMinor">>;
  ourReference?: string;
  yourReference?: string;
  invoiceText?: string;
};

function invoiceAmounts(
  lines: InvoiceLine[],
  input: { netMinor: number; vatRateBps: number },
  roundingMinor: number,
) {
  if (lines.length)
    return invoiceTotals(lines, input.vatRateBps, roundingMinor);
  const vatMinor = calculateVatMinor(input.netMinor, input.vatRateBps);
  return {
    netMinor: input.netMinor,
    vatMinor,
    roundingMinor,
    grossMinor: input.netMinor + vatMinor + roundingMinor,
  };
}

/**
 * Checks an invoice and works out what it stores: amounts from its rows,
 * the customer copy, the consultant's share and the OCR reference.
 */
async function preparedInvoice(
  db: Firestore,
  actor: PortalUser,
  input: InvoiceInput,
  ocrEnabled: boolean,
) {
  if (input.dueDate < input.issueDate)
    throw new FinanceError("invoiceDateInvalid");
  const periodFrom = input.periodFrom ?? null;
  const periodTo = input.periodTo ?? null;
  if (!validInvoicePeriod(periodFrom, periodTo))
    throw new FinanceError("invoicePeriodInvalid");

  const customer = await db
    .collection("financeCustomers")
    .doc(input.customerId)
    .get();
  const customerData = customer.data();
  if (!customer.exists || customerData?.organizationId !== actor.organizationId)
    throw new FinanceError("customerInvalid", 404);

  let model: CompensationModel | null = null;
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
    shareBps = earnsInvoiceShare(model)
      ? (input.shareBpsOverride ?? agreement.shareBps)
      : 0;
  }
  const lines = await resolvedLines(db, actor, input.lines ?? [], input);
  const totals = invoiceAmounts(lines, input, input.roundingMinor ?? 0);
  if (totals.netMinor <= 0) throw new FinanceError("invoiceAmountInvalid");
  return {
    invoiceNumber: input.invoiceNumber,
    consultantId: input.consultantId,
    customerId: input.customerId,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    vatRateBps: input.vatRateBps,
    visibleDescription: input.visibleDescription,
    internalNote: input.internalNote,
    shareBpsOverride: input.shareBpsOverride,
    customerName: String(customerData.name),
    customerContactPerson: String(customerData.contactPerson),
    customerFinanceEmail: String(customerData.financeEmail),
    customerNumber: String(customerData.customerNumber ?? ""),
    periodFrom,
    periodTo,
    ...totals,
    lines,
    ourReference: input.ourReference ?? "",
    yourReference: input.yourReference ?? "",
    invoiceText: input.invoiceText ?? "",
    ocrReference: ocrEnabled ? ocrReferenceFor(input.invoiceNumber) : null,
    compensationModel: model,
    shareBps,
  };
}

async function invoiceNumberTaken(
  transaction: FirebaseFirestore.Transaction,
  db: Firestore,
  organizationId: string,
  invoiceNumber: string,
  exceptId?: string,
) {
  const duplicate = await transaction.get(
    db
      .collection("invoices")
      .where("organizationId", "==", organizationId)
      .where("invoiceNumber", "==", invoiceNumber)
      .limit(2),
  );
  return duplicate.docs.some((document) => document.id !== exceptId);
}

/** Moves the invoice counter past `invoiceNumber` inside a transaction. */
function advanceInvoiceCounter(
  transaction: FirebaseFirestore.Transaction,
  organization: FirebaseFirestore.DocumentReference,
  stored: unknown,
  invoiceNumber: string,
) {
  const current = invoiceSettingsFrom(stored).nextInvoiceNumber;
  const next = nextNumberAfter(current, invoiceNumber);
  if (next !== current)
    transaction.set(
      organization,
      { invoicing: { nextInvoiceNumber: next } },
      { merge: true },
    );
}

export async function createInvoice(
  db: Firestore,
  actor: PortalUser,
  input: InvoiceInput,
) {
  requireFinancePermission(actor, "finance.invoices.add");
  const organization = db.collection("organizations").doc(actor.organizationId);
  const settings = invoiceSettingsFrom(
    (await organization.get()).data()?.invoicing,
  );
  const invoice = await preparedInvoice(db, actor, input, settings.ocrEnabled);
  const ref = db.collection("invoices").doc();
  await db.runTransaction(async (transaction) => {
    const organizationSnapshot = await transaction.get(organization);
    if (
      await invoiceNumberTaken(
        transaction,
        db,
        actor.organizationId,
        input.invoiceNumber,
      )
    )
      throw new FinanceError("invoiceDuplicate", 409);
    advanceInvoiceCounter(
      transaction,
      organization,
      organizationSnapshot.data()?.invoicing,
      input.invoiceNumber,
    );
    transaction.create(ref, {
      organizationId: actor.organizationId,
      ...invoice,
      currency: "SEK",
      status: "issued",
      paidDate: null,
      incomeTransactionId: null,
      incomeTransactionIds: [],
      pdfStoragePath: null,
      pdfGeneratedAt: null,
      sentAt: null,
      sentTo: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
      updatedAt: FieldValue.serverTimestamp(),
      importKey: input.importKey ?? null,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "invoice.created",
      entityType: "invoice",
      entityId: ref.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        invoiceNumber: input.invoiceNumber,
        consultantId: input.consultantId,
        netMinor: invoice.netMinor,
      },
    });
  });
  return ref.id;
}

/**
 * Corrects an issued invoice that has not been sent to the customer. A sent
 * or paid invoice is corrected by voiding it and issuing a new one.
 */
export async function updateInvoice(
  db: Firestore,
  actor: PortalUser,
  input: InvoiceInput & { invoiceId: string },
) {
  requireFinancePermission(actor, "finance.invoices.edit");
  const reference = db.collection("invoices").doc(input.invoiceId);
  const existing = await reference.get();
  const data = existing.data();
  if (!existing.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("invoiceMissing", 404);
  if (data.status !== "issued" || data.sentAt)
    throw new FinanceError("invoiceLocked", 409);
  const organization = db.collection("organizations").doc(actor.organizationId);
  const settings = invoiceSettingsFrom(
    (await organization.get()).data()?.invoicing,
  );
  const invoice = await preparedInvoice(db, actor, input, settings.ocrEnabled);
  await db.runTransaction(async (transaction) => {
    const [fresh, organizationSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(organization),
    ]);
    if (fresh.data()?.status !== "issued" || fresh.data()?.sentAt)
      throw new FinanceError("invoiceLocked", 409);
    if (
      await invoiceNumberTaken(
        transaction,
        db,
        actor.organizationId,
        input.invoiceNumber,
        input.invoiceId,
      )
    )
      throw new FinanceError("invoiceDuplicate", 409);
    advanceInvoiceCounter(
      transaction,
      organization,
      organizationSnapshot.data()?.invoicing,
      input.invoiceNumber,
    );
    transaction.update(reference, {
      ...invoice,
      // The old PDF no longer matches; it is made again on demand.
      pdfStoragePath: null,
      pdfGeneratedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "invoice.updated",
      entityType: "invoice",
      entityId: reference.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        invoiceNumber: input.invoiceNumber,
        previousInvoiceNumber: data.invoiceNumber,
        netMinor: invoice.netMinor,
        previousNetMinor: data.netMinor,
      },
    });
  });
}

export async function markInvoicePaid(
  db: Firestore,
  actor: PortalUser,
  input: { invoiceId: string; paidDate: string; categoryId: string },
) {
  requireFinancePermission(actor, "finance.invoices.edit");
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
      // The company receives the rounding with the VAT.
      roundingMinor: Number(data.roundingMinor ?? 0),
      grossMinor:
        allocation.companyMinor +
        data.vatMinor +
        Number(data.roundingMinor ?? 0),
      consultantBalanceDeltaMinor: allocation.companyMinor,
      invoiceAllocation: "company_share",
    });
    const transactionIds = [companyTransactionRef.id];
    if (
      data.consultantId &&
      earnsInvoiceShare(data.compensationModel) &&
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

type FinancialTransactionInput = {
  direction: "income" | "expense";
  categoryId: string;
  consultantId: string | null;
  date: string;
  netMinor: number;
  vatRateBps: number;
  vatMinor?: number;
  /** Öresavrundning, included in `grossMinor`. */
  roundingMinor?: number;
  grossMinor?: number;
  funding: "company" | "consultant" | null;
  applyConsultantShare: boolean;
  /** Replaces the agreed share for this income, e.g. 100% for a refund. */
  shareBpsOverride?: number | null;
  visibleDescription: string;
  internalNote: string;
  importKey: string | null;
};

/** An override only means something on income that credits the consultant. */
function storedShareBpsOverride(input: FinancialTransactionInput) {
  return input.direction === "income" && input.applyConsultantShare
    ? (input.shareBpsOverride ?? null)
    : null;
}

async function validateFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: FinancialTransactionInput,
) {
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
    if (earnsInvoiceShare(agreement.model)) {
      if (input.direction === "income" && input.applyConsultantShare)
        balanceDelta = calculateShareMinor(
          input.netMinor,
          input.shareBpsOverride ?? agreement.shareBps,
        );
      if (input.direction === "expense" && input.funding === "consultant")
        balanceDelta = -input.netMinor;
    }
  }
  if (!input.consultantId)
    balanceDelta =
      input.direction === "income" ? input.netMinor : -input.netMinor;
  if (input.direction === "expense" && !input.funding)
    throw new FinanceError("fundingRequired");
  return balanceDelta;
}

export async function createFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: FinancialTransactionInput,
) {
  requireFinancePermission(actor, "finance.ledger.add");
  const balanceDelta = await validateFinancialTransaction(db, actor, input);
  const vatMinor =
    input.vatMinor ?? calculateVatMinor(input.netMinor, input.vatRateBps);
  const roundingMinor = input.roundingMinor ?? 0;
  const grossMinor =
    input.grossMinor ?? input.netMinor + vatMinor + roundingMinor;
  const ref = db.collection("financialTransactions").doc();
  const batch = db.batch();
  batch.create(ref, {
    organizationId: actor.organizationId,
    ...input,
    shareBpsOverride: storedShareBpsOverride(input),
    currency: "SEK",
    vatMinor,
    roundingMinor,
    grossMinor,
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

export async function updateFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: FinancialTransactionInput & { transactionId: string },
) {
  requireFinancePermission(actor, "finance.ledger.edit");
  const ref = db.collection("financialTransactions").doc(input.transactionId);
  const snapshot = await ref.get();
  const current = snapshot.data();
  if (!snapshot.exists || current?.organizationId !== actor.organizationId)
    throw new FinanceError("transactionMissing", 404);
  if (
    current.invoiceId ||
    current.status === "reversal" ||
    current.reversedByTransactionId
  )
    throw new FinanceError("transactionNotEditable", 409);

  const balanceDelta = await validateFinancialTransaction(db, actor, input);
  const vatMinor =
    input.vatMinor ?? calculateVatMinor(input.netMinor, input.vatRateBps);
  const roundingMinor = input.roundingMinor ?? 0;
  const grossMinor =
    input.grossMinor ?? input.netMinor + vatMinor + roundingMinor;
  const batch = db.batch();
  batch.update(ref, {
    direction: input.direction,
    categoryId: input.categoryId,
    consultantId: input.consultantId,
    date: input.date,
    netMinor: input.netMinor,
    vatRateBps: input.vatRateBps,
    vatMinor,
    roundingMinor,
    grossMinor,
    funding: input.funding,
    applyConsultantShare: input.applyConsultantShare,
    shareBpsOverride: storedShareBpsOverride(input),
    visibleDescription: input.visibleDescription,
    internalNote: input.internalNote,
    consultantBalanceDeltaMinor: balanceDelta,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(
    db,
    batch,
    actor,
    "financialTransaction.updated",
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
  requireFinancePermission(actor, "finance.ledger.add");
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
      ? earnsInvoiceShare(consultantModel) && expense.funding === "consultant"
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
  requireFinancePermission(actor, "finance.ledger.delete");
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
      roundingMinor: -Number(data.roundingMinor ?? 0),
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

export async function deleteFinancialTransaction(
  db: Firestore,
  actor: PortalUser,
  input: { transactionId: string; confirmation: "I am sure" },
) {
  requireFinancePermission(actor, "finance.ledger.delete");
  const reference = db
    .collection("financialTransactions")
    .doc(input.transactionId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("transactionMissing", 404);
  if (data.invoiceId) throw new FinanceError("transactionInvoiceLinked", 409);
  if (data.status === "reversal" || data.reversedByTransactionId)
    throw new FinanceError("transactionNotDeletable", 409);
  const batch = db.batch();
  batch.delete(reference);
  audit(
    db,
    batch,
    actor,
    "financialTransaction.deleted",
    "financialTransaction",
    reference.id,
    {
      direction: data.direction,
      categoryId: data.categoryId,
      consultantId: data.consultantId ?? null,
      date: data.date,
    },
  );
  await batch.commit();
}

export async function voidInvoice(
  db: Firestore,
  actor: PortalUser,
  input: { invoiceId: string; reason: string },
) {
  requireFinancePermission(actor, "finance.invoices.delete");
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

export async function createVatSettlement(
  db: Firestore,
  actor: PortalUser,
  input: {
    paymentDate: string;
    periodFrom: string;
    periodTo: string;
    amountMinor: number;
    /** Öresavrundning, settled together with the amount. */
    roundingMinor?: number;
    reference: string;
    note: string;
  },
) {
  requireFinancePermission(actor, "finance.vat.add");
  const settlementRef = db.collection("vatSettlements").doc();
  await db.runTransaction(async (transaction) => {
    const [transactionsSnapshot, settlementsSnapshot] = await Promise.all([
      transaction.get(
        db
          .collection("financialTransactions")
          .where("organizationId", "==", actor.organizationId),
      ),
      transaction.get(
        db
          .collection("vatSettlements")
          .where("organizationId", "==", actor.organizationId),
      ),
    ]);
    const payable = vatPayableMinor(
      transactionsSnapshot.docs.map((document) => ({
        direction: document.data().direction as "income" | "expense",
        vatMinor: Number(document.data().vatMinor ?? 0),
      })),
      settlementsSnapshot.docs.map((document) => ({
        amountMinor: Number(document.data().amountMinor ?? 0),
        roundingMinor: Number(document.data().roundingMinor ?? 0),
        status: document.data().status as "active" | "reversed",
      })),
    );
    if (payable <= 0) throw new FinanceError("noVatPayable", 409);
    if (input.amountMinor + (input.roundingMinor ?? 0) > payable)
      throw new FinanceError("vatSettlementExceedsPayable", 409);
    transaction.create(settlementRef, {
      organizationId: actor.organizationId,
      paymentDate: input.paymentDate,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      amountMinor: input.amountMinor,
      roundingMinor: input.roundingMinor ?? 0,
      currency: "SEK",
      reference: input.reference,
      note: input.note,
      status: "active",
      reversalReason: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "vatSettlement.created",
      entityType: "vatSettlement",
      entityId: settlementRef.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        amountMinor: input.amountMinor,
        paymentDate: input.paymentDate,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
      },
    });
  });
  return settlementRef.id;
}

export async function reverseVatSettlement(
  db: Firestore,
  actor: PortalUser,
  input: { settlementId: string; reason: string },
) {
  requireFinancePermission(actor, "finance.vat.delete");
  const reference = db.collection("vatSettlements").doc(input.settlementId);
  await db.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const data = document.data();
    if (!data || data.organizationId !== actor.organizationId)
      throw new FinanceError("vatSettlementNotFound", 404);
    if (data.status === "reversed")
      throw new FinanceError("vatSettlementAlreadyReversed", 409);
    transaction.update(reference, {
      status: "reversed",
      reversalReason: input.reason,
      reversedAt: FieldValue.serverTimestamp(),
      reversedBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "vatSettlement.reversed",
      entityType: "vatSettlement",
      entityId: reference.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { amountMinor: Number(data.amountMinor), reason: input.reason },
    });
  });
}

export async function updateVatSettlement(
  db: Firestore,
  actor: PortalUser,
  input: {
    settlementId: string;
    paymentDate: string;
    periodFrom: string;
    periodTo: string;
    amountMinor: number;
    /** Öresavrundning, settled together with the amount. */
    roundingMinor?: number;
    reference: string;
    note: string;
  },
) {
  requireFinancePermission(actor, "finance.vat.edit");
  const reference = db.collection("vatSettlements").doc(input.settlementId);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    const data = current.data();
    if (!data || data.organizationId !== actor.organizationId)
      throw new FinanceError("vatSettlementNotFound", 404);
    if (data.status !== "active")
      throw new FinanceError("vatSettlementAlreadyReversed", 409);
    const transactionsSnapshot = await transaction.get(
      db
        .collection("financialTransactions")
        .where("organizationId", "==", actor.organizationId),
    );
    const settlementsSnapshot = await transaction.get(
      db
        .collection("vatSettlements")
        .where("organizationId", "==", actor.organizationId),
    );
    const payableIncludingCurrent =
      vatPayableMinor(
        transactionsSnapshot.docs.map((document) => ({
          direction: document.data().direction,
          vatMinor: Number(document.data().vatMinor ?? 0),
        })),
        settlementsSnapshot.docs.map((document) => ({
          amountMinor: Number(document.data().amountMinor ?? 0),
          roundingMinor: Number(document.data().roundingMinor ?? 0),
          status: document.data().status,
        })),
      ) +
      Number(data.amountMinor ?? 0) +
      Number(data.roundingMinor ?? 0);
    if (
      input.amountMinor + (input.roundingMinor ?? 0) >
      payableIncludingCurrent
    )
      throw new FinanceError("vatSettlementExceedsPayable", 409);
    transaction.update(reference, {
      paymentDate: input.paymentDate,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      amountMinor: input.amountMinor,
      roundingMinor: input.roundingMinor ?? 0,
      reference: input.reference,
      note: input.note,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    audit(
      db,
      transaction as unknown as FirebaseFirestore.WriteBatch,
      actor,
      "vatSettlement.updated",
      "vatSettlement",
      reference.id,
      { amountMinor: input.amountMinor },
    );
  });
  return reference.id;
}
