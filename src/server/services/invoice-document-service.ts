import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import type { PortalUser } from "@/domain/types";
import { can } from "@/domain/access/permissions";
import { formatSek } from "@/domain/finance/calculations";
import {
  linesForInvoice,
  madeWithGenerator,
  withLineAmount,
  type InvoiceLine,
} from "@/domain/finance/invoice-lines";
import {
  invoiceSettingsFrom,
  missingInvoiceSettings,
  postalAddressFrom,
  type InvoiceSettings,
} from "@/domain/finance/invoice-settings";
import {
  bankgiroCodeLine,
  ocrReferenceFor,
} from "@/domain/finance/swedish-identifiers";
import {
  buildAccountingEmail,
  customEmailTemplate,
  type NotificationLocale,
} from "@/domain/notifications";
import type { getAdminServices } from "@/lib/firebase/admin";
import { translate, type MessageKey } from "@/lib/localization/messages";
import {
  invoiceFileName,
  invoicePdf,
  PDF_CONTENT_TYPE,
  type InvoicePdfLabels,
} from "@/server/export/invoice-pdf";
import { smtpSettings } from "@/server/services/accounting-email-service";
import {
  FinanceError,
  financeIsEnabled,
  prepareInvoice,
  requireFinancePermission,
  type InvoiceInput,
} from "@/server/services/finance-service";
import { decryptPassword } from "@/server/services/reminder-service";

type Storage = ReturnType<typeof getAdminServices>["storage"];

const LABEL_KEYS = {
  title: "invoicePdf_title",
  invoiceDate: "invoicePdf_invoiceDate",
  invoiceNumber: "invoicePdf_invoiceNumber",
  ocr: "invoicePdf_ocr",
  bankgiro: "invoicePdf_bankgiro",
  dueDate: "invoicePdf_dueDate",
  ourReference: "invoicePdf_ourReference",
  yourReference: "invoicePdf_yourReference",
  paymentTerms: "invoicePdf_paymentTerms",
  paymentTermsDays: "invoicePdf_paymentTermsDays",
  lateInterest: "invoicePdf_lateInterest",
  customerNumber: "invoicePdf_customerNumber",
  customerOrgNumber: "invoicePdf_customerOrgNumber",
  customerVatNumber: "invoicePdf_customerVatNumber",
  articleNumber: "invoicePdf_articleNumber",
  description: "invoicePdf_description",
  quantity: "invoicePdf_quantity",
  unit: "invoicePdf_unit",
  unitPrice: "invoicePdf_unitPrice",
  amount: "invoicePdf_amount",
  vatLine: "invoicePdf_vatLine",
  net: "invoicePdf_net",
  vat: "invoicePdf_vat",
  rounding: "invoicePdf_rounding",
  toPay: "invoicePdf_toPay",
  payWithOcr: "invoicePdf_payWithOcr",
  payWithReference: "invoicePdf_payWithReference",
  iban: "invoicePdf_iban",
  bic: "invoicePdf_bic",
  address: "invoicePdf_address",
  contact: "invoicePdf_contact",
  registration: "invoicePdf_registration",
  payment: "invoicePdf_payment",
  phone: "invoicePdf_phone",
  email: "invoicePdf_email",
  orgNumber: "invoicePdf_orgNumber",
  vatNumber: "invoicePdf_vatNumber",
  fSkatt: "invoicePdf_fSkatt",
  page: "invoicePdf_page",
  slipTitle: "invoicePdf_slipTitle",
  slipHowToPay: "invoicePdf_slipHowToPay",
  slipToPay: "invoicePdf_slipToPay",
  slipToBankgiro: "invoicePdf_slipToBankgiro",
  slipDueBy: "invoicePdf_slipDueBy",
  slipFee: "invoicePdf_slipFee",
  slipPayer: "invoicePdf_slipPayer",
  slipBankgiroBox: "invoicePdf_slipBankgiroBox",
  slipPayee: "invoicePdf_slipPayee",
  slipNoChanges: "invoicePdf_slipNoChanges",
  slipNoMessages: "invoicePdf_slipNoMessages",
  slipMachineRead: "invoicePdf_slipMachineRead",
  slipReference: "invoicePdf_slipReference",
  slipKronor: "invoicePdf_slipKronor",
  slipOre: "invoicePdf_slipOre",
} satisfies Record<keyof InvoicePdfLabels, MessageKey>;

function pdfLabels(locale: NotificationLocale): InvoicePdfLabels {
  return Object.fromEntries(
    Object.entries(LABEL_KEYS).map(([name, key]) => [
      name,
      translate(locale, key),
    ]),
  ) as InvoicePdfLabels;
}

const generatedPath = (organizationId: string, invoiceId: string) =>
  `organizations/${organizationId}/finance/invoice/${invoiceId}/generated-invoice.pdf`;

type CustomerSnapshot = {
  customerAddress: ReturnType<typeof postalAddressFrom>;
  customerNumber: string;
  customerOrgNumber: string;
  customerVatNumber: string;
  invoiceLocale: NotificationLocale;
  paymentTermsDays: number;
};

/** Days between the invoice date and the due date. */
function termDays(issueDate: string, dueDate: string) {
  const days =
    (Date.parse(`${dueDate}T12:00:00Z`) -
      Date.parse(`${issueDate}T12:00:00Z`)) /
    86_400_000;
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0;
}

async function loadInvoice(
  db: Firestore,
  actor: PortalUser,
  invoiceId: string,
) {
  if (!(await financeIsEnabled(db, actor.organizationId)))
    throw new FinanceError("financeDisabled", 409);
  const reference = db.collection("invoices").doc(invoiceId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("invoiceMissing", 404);
  return { reference, data };
}

/**
 * The sender and customer details to print. Once an invoice has been sent
 * it keeps the details it was sent with; before that the current company
 * settings and customer card are used.
 */
async function documentDetails(
  db: Firestore,
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  const sent = Boolean(data.sentAt);
  let issuer: InvoiceSettings;
  if (sent && data.issuerSnapshot) {
    issuer = invoiceSettingsFrom(data.issuerSnapshot);
  } else {
    const organization = (
      await db.collection("organizations").doc(actor.organizationId).get()
    ).data();
    issuer = invoiceSettingsFrom(
      organization?.invoicing,
      String(organization?.name ?? ""),
    );
  }
  let customer: CustomerSnapshot;
  if (sent && data.customerAddress) {
    customer = {
      customerAddress: postalAddressFrom(data.customerAddress),
      customerNumber: String(data.customerNumber ?? ""),
      customerOrgNumber: String(data.customerOrgNumber ?? ""),
      customerVatNumber: String(data.customerVatNumber ?? ""),
      invoiceLocale: data.invoiceLocale === "en-SE" ? "en-SE" : "sv-SE",
      paymentTermsDays: termDays(data.issueDate, data.dueDate),
    };
  } else {
    const card = (
      await db.collection("financeCustomers").doc(String(data.customerId)).get()
    ).data();
    if (!card || card.organizationId !== actor.organizationId)
      throw new FinanceError("customerInvalid", 404);
    customer = {
      customerAddress: postalAddressFrom(card),
      customerNumber: String(card.customerNumber ?? ""),
      customerOrgNumber: String(card.orgNumber ?? ""),
      customerVatNumber: String(card.vatNumber ?? ""),
      invoiceLocale: card.invoiceLocale === "en-SE" ? "en-SE" : "sv-SE",
      paymentTermsDays: termDays(data.issueDate, data.dueDate),
    };
  }
  return { issuer, customer };
}

/** What is still missing before this invoice can be generated. */
export function invoiceDocumentProblems(
  issuer: InvoiceSettings,
  customer: CustomerSnapshot,
) {
  const problems: string[] = missingInvoiceSettings(issuer).map(
    (field) => `settings.${field}`,
  );
  const address = customer.customerAddress;
  if (
    !address.addressLine.trim() ||
    !address.postalCode.trim() ||
    !address.city.trim()
  )
    problems.push("customer.address");
  return problems;
}

function render(
  data: FirebaseFirestore.DocumentData,
  issuer: InvoiceSettings,
  customer: CustomerSnapshot,
  ocrReference: string | null,
) {
  const labels = pdfLabels(customer.invoiceLocale);
  const lines: InvoiceLine[] = linesForInvoice({
    lines: Array.isArray(data.lines)
      ? (data.lines as InvoiceLine[]).map((line) =>
          withLineAmount({
            articleNumber: String(line.articleNumber ?? ""),
            description: String(line.description ?? ""),
            quantityThousandths: Number(line.quantityThousandths ?? 0),
            unit: String(line.unit ?? ""),
            unitPriceMinor: Number(line.unitPriceMinor ?? 0),
          }),
        )
      : null,
    netMinor: Number(data.netMinor),
    visibleDescription: String(data.visibleDescription ?? ""),
  });
  const pdf = invoicePdf({
    issuer,
    customer: {
      ...customer.customerAddress,
      name: String(data.customerName),
      customerNumber: customer.customerNumber,
      orgNumber: customer.customerOrgNumber,
      vatNumber: customer.customerVatNumber,
    },
    invoiceNumber: String(data.invoiceNumber),
    issueDate: String(data.issueDate),
    dueDate: String(data.dueDate),
    ocrReference,
    ourReference: String(data.ourReference ?? "") || issuer.defaultOurReference,
    yourReference: String(data.yourReference ?? ""),
    paymentTermsDays: customer.paymentTermsDays,
    lines,
    invoiceText: String(data.invoiceText ?? ""),
    vatRateBps: Number(data.vatRateBps),
    netMinor: Number(data.netMinor),
    vatMinor: Number(data.vatMinor),
    roundingMinor: Number(data.roundingMinor ?? 0),
    grossMinor: Number(data.grossMinor),
    // The slip needs an OCR number; without one the payment box says how
    // to pay instead.
    codeLine: ocrReference
      ? bankgiroCodeLine({
          ocrReference,
          amountMinor: Number(data.grossMinor),
          bankgiro: issuer.bankgiro,
        })
      : null,
    labels,
  });
  return {
    pdf,
    fileName: invoiceFileName(labels.title, String(data.invoiceNumber)),
  };
}

/** Renders an invoice's PDF after checking the details it needs. */
async function renderFor(
  db: Firestore,
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  const { issuer, customer } = await documentDetails(db, actor, data);
  const problems = invoiceDocumentProblems(issuer, customer);
  if (problems.length)
    throw new FinanceError(
      problems.some((problem) => problem.startsWith("settings."))
        ? "invoiceSettingsIncomplete"
        : "customerAddressMissing",
      409,
    );
  const ocrReference =
    data.sentAt && data.ocrReference !== undefined
      ? (data.ocrReference as string | null)
      : issuer.ocrEnabled
        ? ocrReferenceFor(String(data.invoiceNumber))
        : null;
  return {
    issuer,
    customer,
    ocrReference,
    ...render(data, issuer, customer, ocrReference),
  };
}

/**
 * The PDF an invoice would get with the details in the form, before it is
 * saved; nothing is stored. Saving makes the real one from the saved data.
 */
export async function previewInvoicePdf(
  db: Firestore,
  actor: PortalUser,
  input: InvoiceInput & { invoiceId?: string | null },
) {
  if (
    !can(actor, "finance.invoices.add") &&
    !can(actor, "finance.invoices.edit")
  )
    throw new FinanceError("forbidden", 403);
  if (!(await financeIsEnabled(db, actor.organizationId)))
    throw new FinanceError("financeDisabled", 409);
  if (input.useGenerator !== true)
    throw new FinanceError("invoiceNotGenerated", 409);
  const invoice = await prepareInvoice(db, actor, input);
  const { pdf, fileName } = await renderFor(db, actor, {
    ...invoice,
    sentAt: null,
  });
  return { pdf, fileName };
}

/**
 * Makes the invoice PDF, stores it with the invoice and records which
 * company and customer details it was made with.
 */
export async function generateInvoicePdf(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  invoiceId: string,
) {
  requireFinancePermission(actor, "finance.invoices.edit");
  const { reference, data } = await loadInvoice(db, actor, invoiceId);
  if (data.status === "void") throw new FinanceError("invoiceLocked", 409);
  if (!madeWithGenerator(data))
    throw new FinanceError("invoiceNotGenerated", 409);
  const { issuer, customer, ocrReference, pdf, fileName } = await renderFor(
    db,
    actor,
    data,
  );
  const path = generatedPath(actor.organizationId, invoiceId);
  await storage
    .bucket()
    .file(path)
    .save(pdf, {
      resumable: false,
      metadata: {
        contentType: PDF_CONTENT_TYPE,
        cacheControl: "private, no-cache",
      },
    });
  const generatedAt = new Date().toISOString();
  // The PDF is also one of the invoice's attachments, so it shows and
  // downloads with the other files; it does not count toward their limit.
  const attachmentId = String(
    data.pdfAttachmentId || `${invoiceId}-invoice-pdf`,
  );
  const batch = db.batch();
  batch.set(db.collection("financeAttachments").doc(attachmentId), {
    organizationId: actor.organizationId,
    entityType: "invoice",
    entityId: invoiceId,
    name: fileName,
    size: pdf.length,
    contentType: PDF_CONTENT_TYPE,
    storagePath: path,
    generated: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
  });
  batch.update(reference, {
    pdfStoragePath: path,
    pdfAttachmentId: attachmentId,
    pdfFileName: fileName,
    pdfGeneratedAt: generatedAt,
    ocrReference,
    issuerSnapshot: issuer,
    ...customer,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "invoice.pdfGenerated",
    entityType: "invoice",
    entityId: invoiceId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { invoiceNumber: String(data.invoiceNumber), size: pdf.length },
  });
  await batch.commit();
  return { pdf, fileName, generatedAt };
}

/** The stored PDF, generated first when there is none yet. */
export async function invoicePdfFile(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  invoiceId: string,
) {
  requireFinancePermission(actor, "finance.invoices.view");
  const { data } = await loadInvoice(db, actor, invoiceId);
  if (data.pdfStoragePath) {
    const [contents] = await storage
      .bucket()
      .file(String(data.pdfStoragePath))
      .download();
    return {
      pdf: contents,
      fileName: String(
        data.pdfFileName ??
          invoiceFileName("Faktura", String(data.invoiceNumber)),
      ),
    };
  }
  if (!can(actor, "finance.invoices.edit"))
    throw new FinanceError("invoicePdfMissing", 404);
  const { pdf, fileName } = await generateInvoicePdf(
    db,
    storage,
    actor,
    invoiceId,
  );
  return { pdf, fileName };
}

/**
 * Emails the invoice PDF to the customer's finance address with the
 * organization's SMTP settings, then marks the invoice as sent.
 */
export async function sendInvoiceToCustomer(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  invoiceId: string,
) {
  requireFinancePermission(actor, "finance.invoices.send");
  const { reference, data } = await loadInvoice(db, actor, invoiceId);
  if (data.status === "void") throw new FinanceError("invoiceLocked", 409);
  // Invoices made elsewhere are sent from there.
  if (!madeWithGenerator(data))
    throw new FinanceError("invoiceNotGenerated", 409);
  const recipient = String(data.customerFinanceEmail ?? "").trim();
  if (!recipient) throw new FinanceError("customerEmailMissing", 409);
  const smtp = await smtpSettings(db, actor.organizationId);
  if (!smtp) throw new FinanceError("emailNotConfigured", 409);

  // Unsent invoices are made again so they match the current details.
  const { pdf, fileName } =
    data.sentAt && data.pdfStoragePath
      ? await invoicePdfFile(db, storage, actor, invoiceId)
      : await generateInvoicePdf(db, storage, actor, invoiceId);
  const fresh = (await reference.get()).data()!;
  const issuer = invoiceSettingsFrom(fresh.issuerSnapshot);
  const locale: NotificationLocale =
    fresh.invoiceLocale === "en-SE" ? "en-SE" : "sv-SE";
  const templates = await db
    .collection("emailTemplates")
    .doc(actor.organizationId)
    .get();
  const email = buildAccountingEmail(
    "customerInvoice",
    locale,
    {
      recipientName: String(fresh.customerContactPerson ?? fresh.customerName),
      organizationName: issuer.legalName,
      customer: String(fresh.customerName),
      invoiceNumber: String(fresh.invoiceNumber),
      issueDate: String(fresh.issueDate),
      dueDate: String(fresh.dueDate),
      total: formatSek(Number(fresh.grossMinor), locale),
      bankgiro: issuer.bankgiro,
      paymentReference: String(fresh.ocrReference || fresh.invoiceNumber),
    },
    customEmailTemplate(
      templates.data()?.notifications,
      "customerInvoice",
      locale,
    ),
  );
  const transporter = nodemailer.createTransport({
    host: String(smtp.smtpHost),
    port: Number(smtp.smtpPort),
    secure: Boolean(smtp.smtpSecure),
    auth: {
      user: String(smtp.smtpUsername),
      pass: decryptPassword(String(smtp.encryptedPassword)),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  try {
    await transporter.sendMail({
      from: { name: String(smtp.senderName), address: String(smtp.fromEmail) },
      to: {
        name: String(fresh.customerContactPerson || fresh.customerName),
        address: recipient,
      },
      replyTo: issuer.email || actor.email || undefined,
      ...email,
      attachments: [
        { filename: fileName, content: pdf, contentType: PDF_CONTENT_TYPE },
      ],
    });
  } catch (caught) {
    console.error("Customer invoice email failed", {
      organizationId: actor.organizationId,
      invoiceId,
      error: caught instanceof Error ? caught.message.slice(0, 300) : "error",
    });
    throw new FinanceError("invoiceSendFailed", 502);
  }
  const sentAt = new Date().toISOString();
  const batch = db.batch();
  batch.update(reference, {
    sentAt,
    sentTo: recipient,
    sentBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "invoice.sent",
    entityType: "invoice",
    entityId: invoiceId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      invoiceNumber: String(fresh.invoiceNumber),
      resent: Boolean(data.sentAt),
    },
  });
  await batch.commit();
  return { sentAt, sentTo: recipient };
}

export type InvoiceHours = {
  lines: Array<Omit<InvoiceLine, "amountMinor">>;
  approvedMinutes: number;
  /** Worked minutes in the period that are not approved yet. */
  pendingMinutes: number;
};

/**
 * A consultant's approved worked hours in a period, one row per time code
 * at its hourly rate, for filling an invoice.
 */
export async function approvedInvoiceHours(
  db: Firestore,
  actor: PortalUser,
  input: { consultantId: string; periodFrom: string; periodTo: string },
): Promise<InvoiceHours> {
  if (
    !can(actor, "finance.invoices.add") &&
    !can(actor, "finance.invoices.edit")
  )
    throw new FinanceError("forbidden", 403);
  if (input.periodTo < input.periodFrom)
    throw new FinanceError("invoicePeriodInvalid");
  const user = await db.collection("users").doc(input.consultantId).get();
  if (!user.exists || user.data()?.organizationId !== actor.organizationId)
    throw new FinanceError("consultantInvalid", 404);
  const [entries, timesheets, codes] = await Promise.all([
    db
      .collection("timeEntries")
      .where("userId", "==", input.consultantId)
      .get(),
    db.collection("timesheets").where("userId", "==", input.consultantId).get(),
    db
      .collection("timeCodes")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const approved = new Set(
    timesheets.docs
      .filter(
        (document) =>
          document.data().organizationId === actor.organizationId &&
          document.data().status === "approved",
      )
      .map((document) => document.id),
  );
  const workedCodes = codes.docs
    .map((document) => document.data())
    .filter((code) => code.countsAsWorkedTime === true);
  const fallbackRate = Number(
    workedCodes.find((code) => code.assignedUserId === input.consultantId)
      ?.hourlyRate ??
      workedCodes.find((code) => !code.assignedUserId)?.hourlyRate ??
      0,
  );
  const byCode = new Map<
    string,
    { name: string; code: string; minutes: number; rateMinor: number }
  >();
  let pendingMinutes = 0;
  let approvedMinutes = 0;
  for (const document of entries.docs) {
    const entry = document.data();
    if (
      entry.organizationId !== actor.organizationId ||
      entry.date < input.periodFrom ||
      entry.date > input.periodTo ||
      entry.timeCodeSnapshot?.countsAsWorkedTime !== true
    )
      continue;
    const minutes = Number(entry.minutes ?? 0);
    if (!approved.has(String(entry.timesheetId))) {
      pendingMinutes += minutes;
      continue;
    }
    approvedMinutes += minutes;
    const rate = Number(entry.timeCodeSnapshot?.hourlyRate || fallbackRate);
    const rateMinor = Math.round(rate * 100);
    const key = `${entry.timeCodeId}:${rateMinor}`;
    const current = byCode.get(key) ?? {
      name: String(entry.timeCodeSnapshot?.name ?? ""),
      code: String(entry.timeCodeSnapshot?.code ?? ""),
      minutes: 0,
      rateMinor,
    };
    current.minutes += minutes;
    byCode.set(key, current);
  }
  const lines = [...byCode.values()]
    .filter((item) => item.minutes > 0)
    .map((item) => ({
      articleNumber: "",
      description: item.name || item.code,
      // Minutes to thousandths of an hour, rounded to whole thousandths.
      quantityThousandths: Math.round((item.minutes * 1000) / 60),
      unit: "h",
      unitPriceMinor: item.rateMinor,
    }));
  return { lines, approvedMinutes, pendingMinutes };
}
