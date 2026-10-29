import {
  notificationLocale,
  type NotificationLocale,
} from "@/domain/notifications";

/** What an accounting contact can receive by email. */
export type AccountingEmailPurpose =
  "transactions" | "invoices" | "vatSettlements";
export const ACCOUNTING_EMAIL_PURPOSES: AccountingEmailPurpose[] = [
  "transactions",
  "invoices",
  "vatSettlements",
];

/** Finance records that can be sent to accounting. */
export type AccountingEntityType = "transaction" | "invoice" | "vatSettlement";
export const ACCOUNTING_ENTITY_PURPOSE: Record<
  AccountingEntityType,
  AccountingEmailPurpose
> = {
  transaction: "transactions",
  invoice: "invoices",
  vatSettlement: "vatSettlements",
};

export type AccountingContact = {
  id: string;
  name: string;
  email: string;
  /** Language of the emails this contact receives. */
  locale: NotificationLocale;
} & Record<AccountingEmailPurpose, boolean>;

/** Contacts as stored; anything malformed is dropped. */
export function accountingContactsFrom(value: unknown): AccountingContact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const data = item as Record<string, unknown> | null;
    if (
      typeof data?.id !== "string" ||
      typeof data.name !== "string" ||
      typeof data.email !== "string" ||
      !data.email.includes("@")
    )
      return [];
    return [
      {
        id: data.id,
        name: data.name,
        email: data.email,
        locale: notificationLocale(data.locale),
        transactions: data.transactions === true,
        invoices: data.invoices === true,
        vatSettlements: data.vatSettlements === true,
      },
    ];
  });
}

export function accountingRecipients(
  contacts: AccountingContact[],
  purpose: AccountingEmailPurpose,
) {
  return contacts.filter((contact) => contact[purpose]);
}

/** "Name <email>" for showing who an email will go to. */
export function accountingRecipientLabel(contact: AccountingContact) {
  return `${contact.name} <${contact.email}>`;
}
