/**
 * The company details printed on the invoices the portal generates, stored on
 * the organization document as `invoicing`, plus the invoice and customer
 * number counters.
 */
export type InvoiceSettings = {
  legalName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  orgNumber: string;
  vatNumber: string;
  fSkatt: boolean;
  bankgiro: string;
  iban: string;
  bic: string;
  bankName: string;
  paymentTermsDays: number;
  lateInterestText: string;
  defaultOurReference: string;
  nextInvoiceNumber: number;
  nextCustomerNumber: number;
  ocrEnabled: boolean;
};

export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export const emptyInvoiceSettings = (name = ""): InvoiceSettings => ({
  legalName: name,
  addressLine: "",
  postalCode: "",
  city: "",
  country: "Sverige",
  phone: "",
  email: "",
  website: "",
  orgNumber: "",
  vatNumber: "",
  fSkatt: true,
  bankgiro: "",
  iban: "",
  bic: "",
  bankName: "",
  paymentTermsDays: DEFAULT_PAYMENT_TERMS_DAYS,
  lateInterestText: "Referensränta + 8,0 %",
  defaultOurReference: "",
  nextInvoiceNumber: 1,
  nextCustomerNumber: 1,
  ocrEnabled: true,
});

const text = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;
const whole = (value: unknown, fallback: number) =>
  Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;

/** Reads the stored settings, filling gaps with the defaults. */
export function invoiceSettingsFrom(
  stored: unknown,
  organizationName = "",
): InvoiceSettings {
  const defaults = emptyInvoiceSettings(organizationName);
  const value = (stored ?? {}) as Record<string, unknown>;
  return {
    legalName: text(value.legalName, defaults.legalName),
    addressLine: text(value.addressLine, ""),
    postalCode: text(value.postalCode, ""),
    city: text(value.city, ""),
    country: text(value.country, defaults.country),
    phone: text(value.phone, ""),
    email: text(value.email, ""),
    website: text(value.website, ""),
    orgNumber: text(value.orgNumber, ""),
    vatNumber: text(value.vatNumber, ""),
    fSkatt: typeof value.fSkatt === "boolean" ? value.fSkatt : defaults.fSkatt,
    bankgiro: text(value.bankgiro, ""),
    iban: text(value.iban, ""),
    bic: text(value.bic, ""),
    bankName: text(value.bankName, ""),
    paymentTermsDays: whole(value.paymentTermsDays, defaults.paymentTermsDays),
    lateInterestText: text(value.lateInterestText, defaults.lateInterestText),
    defaultOurReference: text(value.defaultOurReference, ""),
    nextInvoiceNumber: whole(value.nextInvoiceNumber, 1),
    nextCustomerNumber: whole(value.nextCustomerNumber, 1),
    ocrEnabled:
      typeof value.ocrEnabled === "boolean"
        ? value.ocrEnabled
        : defaults.ocrEnabled,
  };
}

export const REQUIRED_INVOICE_SETTINGS = [
  "legalName",
  "addressLine",
  "postalCode",
  "city",
  "orgNumber",
  "vatNumber",
  "bankgiro",
] as const satisfies readonly (keyof InvoiceSettings)[];

/** The company details still missing before an invoice can be generated. */
export function missingInvoiceSettings(settings: InvoiceSettings) {
  return REQUIRED_INVOICE_SETTINGS.filter((key) => !settings[key].trim());
}

/**
 * The counter after an invoice is saved with `chosen`: a plain number at or
 * above the counter moves it past that number; anything else leaves it.
 */
export function nextNumberAfter(current: number, chosen: string) {
  const value = chosen.trim();
  if (!/^\d{1,12}$/.test(value)) return current;
  const number = Number(value);
  return number >= current ? number + 1 : current;
}

/** ISO date `days` after `date`, both YYYY-MM-DD. */
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The address block of a customer, as stored on customers and invoices. */
export type PostalAddress = {
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
};

export function postalAddressFrom(value: unknown): PostalAddress {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    addressLine: text(data.addressLine, ""),
    postalCode: text(data.postalCode, ""),
    city: text(data.city, ""),
    country: text(data.country, ""),
  };
}

/** Customers in Sweden do not print the country, as Fortnox omits it too. */
export function isDomesticCountry(country: string) {
  return ["", "sverige", "sweden", "se"].includes(country.trim().toLowerCase());
}
