import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import {
  ACCOUNTING_ENTITY_PURPOSE,
  accountingContactsFrom,
  accountingRecipientLabel,
  accountingRecipients,
  type AccountingContact,
  type AccountingEmailPurpose,
  type AccountingEntityType,
} from "@/domain/accounting-email";
import type { PortalUser } from "@/domain/types";
import { formatSek } from "@/domain/finance/calculations";
import {
  buildAccountingEmail,
  customEmailTemplate,
  type AccountingEmailKind,
} from "@/domain/notifications";
import type { getAdminServices } from "@/lib/firebase/admin";
import { translate, type MessageKey } from "@/lib/localization/messages";
import { decryptPassword } from "@/server/services/reminder-service";

type Storage = ReturnType<typeof getAdminServices>["storage"];

/** Attachments above this total are listed in the email instead of attached. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export class AccountingEmailError extends Error {
  constructor(
    readonly code:
      "noRecipients" | "emailNotConfigured" | "notFound" | "sendFailed",
    readonly status: number,
  ) {
    super(code);
  }
}

const settingsDoc = (db: Firestore, organizationId: string) =>
  db.collection("accountingEmailSettings").doc(organizationId);

export async function readAccountingContacts(
  db: Firestore,
  organizationId: string,
) {
  const snapshot = await settingsDoc(db, organizationId).get();
  return accountingContactsFrom(snapshot.data()?.contacts);
}

export async function saveAccountingContacts(
  db: Firestore,
  actor: PortalUser,
  contacts: AccountingContact[],
) {
  const batch = db.batch();
  batch.set(settingsDoc(db, actor.organizationId), {
    organizationId: actor.organizationId,
    contacts,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "accountingEmailsUpdated",
    entityType: "accountingEmailSettings",
    entityId: actor.organizationId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { contactCount: contacts.length },
  });
  await batch.commit();
}

async function smtpSettings(db: Firestore, organizationId: string) {
  const settings = (
    await db.collection("reminderSettings").doc(organizationId).get()
  ).data();
  return settings?.encryptedPassword && settings.smtpHost && settings.fromEmail
    ? settings
    : null;
}

/**
 * Who a record of this kind would be emailed to, as "Name <email>". Empty
 * when nobody is chosen or email is not set up, so forms do not ask.
 */
export async function accountingRecipientLabels(
  db: Firestore,
  organizationId: string,
  purpose: AccountingEmailPurpose,
) {
  const [contacts, smtp] = await Promise.all([
    readAccountingContacts(db, organizationId),
    smtpSettings(db, organizationId),
  ]);
  if (!smtp) return [];
  return accountingRecipients(contacts, purpose).map(accountingRecipientLabel);
}

export async function isAccountingEmailConfigured(
  db: Firestore,
  organizationId: string,
) {
  return Boolean(await smtpSettings(db, organizationId));
}

type Details = {
  kind: AccountingEmailKind;
  /** Values for the template's own placeholders, such as `{{total}}`. */
  values: Record<string, string>;
  rows: Array<[string, string]>;
};

async function entityDetails(
  db: Firestore,
  organizationId: string,
  entityType: AccountingEntityType,
  data: FirebaseFirestore.DocumentData,
  locale: PortalUser["locale"],
): Promise<Details> {
  const t = (key: string) => translate(locale, key as MessageKey) ?? key;
  const sek = (minor: unknown) => formatSek(Number(minor ?? 0), locale);
  const percent = (bps: unknown) =>
    `${(Number(bps ?? 0) / 100).toLocaleString(locale)} %`;
  const consultantName = async (id: unknown) => {
    if (typeof id !== "string" || !id) return t("companyOnly");
    const user = await db.collection("users").doc(id).get();
    return user.data()?.organizationId === organizationId
      ? String(user.data()?.displayName ?? "")
      : "";
  };
  const optional = (rows: Array<[string, string]>) =>
    rows.filter(([, value]) => value.trim() !== "");
  const rounding = Number(data.roundingMinor ?? 0);

  if (entityType === "transaction") {
    const categoryDoc = await db
      .collection("financeCategories")
      .doc(String(data.categoryId))
      .get();
    const names = categoryDoc.data()?.name as
      { en?: string; sv?: string } | undefined;
    const type = t(String(data.direction));
    const category = String((locale === "sv-SE" ? names?.sv : names?.en) ?? "");
    const consultant = await consultantName(data.consultantId);
    return {
      kind: "accountingTransaction",
      values: {
        type,
        entity: type.toLocaleLowerCase(locale),
        date: String(data.date ?? ""),
        category,
        consultant,
        netAmount: sek(data.netMinor),
        vatAmount: sek(data.vatMinor),
        total: sek(data.grossMinor),
      },
      rows: optional([
        [t("type"), type],
        [t("date"), String(data.date ?? "")],
        [t("category"), category],
        [t("consultant"), consultant],
        [t("netAmount"), sek(data.netMinor)],
        [t("vatPercent"), percent(data.vatRateBps)],
        [t("vatAmount"), sek(data.vatMinor)],
        [t("rounding"), rounding ? sek(rounding) : ""],
        [t("totalIncludingVat"), sek(data.grossMinor)],
        [
          t("funding"),
          data.funding === "consultant"
            ? t("consultantFunded")
            : data.funding === "company"
              ? t("companyFunded")
              : "",
        ],
        [t("consultantDescription"), String(data.visibleDescription ?? "")],
        [t("internalNote"), String(data.internalNote ?? "")],
      ]),
    };
  }
  if (entityType === "invoice") {
    const period =
      data.periodFrom && data.periodTo
        ? `${data.periodFrom} – ${data.periodTo}`
        : "";
    const consultant = await consultantName(data.consultantId);
    return {
      kind: "accountingInvoice",
      values: {
        invoiceNumber: String(data.invoiceNumber ?? ""),
        customer: String(data.customerName ?? ""),
        consultant,
        period,
        issueDate: String(data.issueDate ?? ""),
        dueDate: String(data.dueDate ?? ""),
        total: sek(data.grossMinor),
      },
      rows: optional([
        [t("invoiceNumber"), String(data.invoiceNumber ?? "")],
        [t("customer"), String(data.customerName ?? "")],
        [t("consultant"), consultant],
        [t("invoicePeriod"), period],
        [t("issueDate"), String(data.issueDate ?? "")],
        [t("dueDate"), String(data.dueDate ?? "")],
        [t("netAmount"), sek(data.netMinor)],
        [t("vatPercent"), percent(data.vatRateBps)],
        [t("vatAmount"), sek(data.vatMinor)],
        [t("rounding"), rounding ? sek(rounding) : ""],
        [t("totalIncludingVat"), sek(data.grossMinor)],
        [t("status"), t(String(data.status ?? ""))],
        [t("consultantDescription"), String(data.visibleDescription ?? "")],
        [t("internalNote"), String(data.internalNote ?? "")],
      ]),
    };
  }
  const period = `${data.periodFrom} – ${data.periodTo}`;
  return {
    kind: "accountingVatSettlement",
    values: {
      period,
      paymentDate: String(data.paymentDate ?? ""),
      amount: sek(data.amountMinor),
      reference: String(data.reference ?? ""),
    },
    rows: optional([
      [t("vatPeriod"), period],
      [t("paymentDate"), String(data.paymentDate ?? "")],
      [t("amount"), sek(data.amountMinor)],
      [t("rounding"), rounding ? sek(rounding) : ""],
      [t("paymentReference"), String(data.reference ?? "")],
      [t("status"), t(String(data.status ?? ""))],
      [t("internalNote"), String(data.note ?? "")],
    ]),
  };
}

const COLLECTIONS: Record<AccountingEntityType, string> = {
  transaction: "financialTransactions",
  invoice: "invoices",
  vatSettlement: "vatSettlements",
};

/**
 * Emails a finance record's details and files to every accounting contact
 * chosen for its kind, one email per contact, with the organization's SMTP
 * settings. Returns how many were sent; throws when none could be.
 */
export async function sendAccountingEmail(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  entityType: AccountingEntityType,
  entityId: string,
) {
  const [contacts, smtp, entity, organization, templates, attachmentSnapshot] =
    await Promise.all([
      readAccountingContacts(db, actor.organizationId),
      smtpSettings(db, actor.organizationId),
      db.collection(COLLECTIONS[entityType]).doc(entityId).get(),
      db.collection("organizations").doc(actor.organizationId).get(),
      db.collection("emailTemplates").doc(actor.organizationId).get(),
      db
        .collection("financeAttachments")
        .where("organizationId", "==", actor.organizationId)
        .where("entityType", "==", entityType)
        .where("entityId", "==", entityId)
        .get(),
    ]);
  const data = entity.data();
  if (!data || data.organizationId !== actor.organizationId)
    throw new AccountingEmailError("notFound", 404);
  const recipients = accountingRecipients(
    contacts,
    ACCOUNTING_ENTITY_PURPOSE[entityType],
  );
  if (!recipients.length) throw new AccountingEmailError("noRecipients", 409);
  if (!smtp) throw new AccountingEmailError("emailNotConfigured", 409);

  const locale = actor.locale;
  const t = (key: string) => translate(locale, key as MessageKey) ?? key;
  const organizationName = String(organization.data()?.name ?? "Debageri");
  const details = await entityDetails(
    db,
    actor.organizationId,
    entityType,
    data,
    locale,
  );

  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }> = [];
  const skipped: string[] = [];
  let totalBytes = 0;
  for (const document of attachmentSnapshot.docs) {
    const file = document.data();
    const size = Number(file.size ?? 0);
    if (totalBytes + size > MAX_ATTACHMENT_BYTES) {
      skipped.push(String(file.name));
      continue;
    }
    const [content] = await storage
      .bucket()
      .file(String(file.storagePath))
      .download();
    totalBytes += content.length;
    attachments.push({
      filename: String(file.name),
      content,
      contentType: String(file.contentType),
    });
  }

  const width = Math.max(...details.rows.map(([label]) => label.length));
  const files = [
    attachments.length
      ? t("accountingEmailFiles").replace(
          "{files}",
          attachments.map((file) => file.filename).join(", "),
        )
      : t("accountingEmailNoFiles"),
    ...(skipped.length
      ? [
          t("accountingEmailSkippedFiles").replace(
            "{files}",
            skipped.join(", "),
          ),
        ]
      : []),
  ].join("\n");
  const custom = customEmailTemplate(
    templates.data()?.notifications,
    details.kind,
    locale,
  );
  const email = (recipient: AccountingContact) =>
    buildAccountingEmail(
      details.kind,
      locale,
      {
        ...details.values,
        recipientName: recipient.name,
        organizationName,
        senderName: actor.displayName || actor.email,
        details: details.rows
          .map(
            ([label, value]) =>
              `${`${label}:`.padEnd(width + 2)}${value.replace(/[\r\n]+/g, " ")}`,
          )
          .join("\n"),
        files,
      },
      custom,
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
  let sent = 0;
  const failures: string[] = [];
  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: {
          name: String(smtp.senderName),
          address: String(smtp.fromEmail),
        },
        to: { name: recipient.name, address: recipient.email },
        replyTo: actor.email || undefined,
        ...email(recipient),
        attachments,
      });
      sent++;
    } catch (caught) {
      failures.push(
        caught instanceof Error ? caught.message.slice(0, 300) : "error",
      );
      console.error("Accounting email failed", {
        organizationId: actor.organizationId,
        entityType,
        entityId,
        contactId: recipient.id,
        error: failures.at(-1),
      });
    }
  }
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "accountingEmail.sent",
    entityType,
    entityId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      recipients: recipients.length,
      sent,
      failed: failures.length,
      attachments: attachments.length,
    },
  });
  if (!sent) throw new AccountingEmailError("sendFailed", 502);
  return { sent, failed: failures.length };
}
