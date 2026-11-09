/**
 * Checks and formats for the Swedish numbers an invoice carries: bankgiro,
 * plusgiro, organization number, VAT number and the OCR payment reference. All of them
 * end with a Luhn (modulus 10) check digit.
 */

const digitsOnly = (value: string) => value.replace(/[\s-]/g, "");

/** The modulus 10 check digit that makes `payload` + digit pass Luhn. */
export function luhnCheckDigit(payload: string) {
  if (!/^\d+$/.test(payload)) throw new Error("digitsRequired");
  let sum = 0;
  // The rightmost payload digit is doubled, then every second one leftwards.
  for (let index = 0; index < payload.length; index++) {
    let digit = Number(payload[payload.length - 1 - index]);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function passesLuhn(value: string) {
  if (!/^\d{2,}$/.test(value)) return false;
  return luhnCheckDigit(value.slice(0, -1)) === Number(value.slice(-1));
}

/** A bankgiro number has 7 or 8 digits, written 123-4567 or 1234-5678. */
export function validBankgiro(value: string) {
  const digits = digitsOnly(value);
  return /^\d{7,8}$/.test(digits) && passesLuhn(digits);
}

export function formatBankgiro(value: string) {
  const digits = digitsOnly(value);
  return /^\d{7,8}$/.test(digits)
    ? `${digits.slice(0, -4)}-${digits.slice(-4)}`
    : value.trim();
}

/**
 * A plusgiro number has 2 to 8 digits, the last a check digit after a dash,
 * with the rest in pairs from the right: 12 34 56-7 or 4 77 92-1.
 */
export function validPlusgiro(value: string) {
  const digits = digitsOnly(value);
  return /^\d{2,8}$/.test(digits) && passesLuhn(digits);
}

export function formatPlusgiro(value: string) {
  const digits = digitsOnly(value);
  if (!/^\d{2,8}$/.test(digits)) return value.trim();
  const body = digits.slice(0, -1);
  const pairs: string[] = [];
  for (let end = body.length; end > 0; end -= 2)
    pairs.unshift(body.slice(Math.max(0, end - 2), end));
  return `${pairs.join(" ")}-${digits.slice(-1)}`;
}

/** A Swedish organization number: ten digits, written 559555-8429. */
export function validOrgNumber(value: string) {
  const digits = digitsOnly(value);
  return /^\d{10}$/.test(digits) && passesLuhn(digits);
}

export function formatOrgNumber(value: string) {
  const digits = digitsOnly(value);
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 6)}-${digits.slice(6)}`
    : value.trim();
}

/** The Swedish VAT number for an organization number: SE5595558429 + 01. */
export function vatNumberFor(orgNumber: string) {
  const digits = digitsOnly(orgNumber);
  return /^\d{10}$/.test(digits) ? `SE${digits}01` : "";
}

export function validSwedishVatNumber(value: string) {
  const clean = value.replace(/\s/g, "").toUpperCase();
  return /^SE\d{10}01$/.test(clean) && validOrgNumber(clean.slice(2, 12));
}

/** Longest OCR reference Bankgirot accepts. */
const MAX_OCR_LENGTH = 25;

/**
 * The OCR reference for an invoice number: the number, a length digit and a
 * check digit, so it passes both soft and hard checks at Bankgirot. Invoice
 * 20 becomes 2048. Null when the invoice number is not plain digits.
 */
export function ocrReferenceFor(invoiceNumber: string) {
  const payload = invoiceNumber.trim();
  if (!/^\d+$/.test(payload) || payload.length + 2 > MAX_OCR_LENGTH)
    return null;
  const withLength = `${payload}${(payload.length + 2) % 10}`;
  return `${withLength}${luhnCheckDigit(withLength)}`;
}

export function validOcrReference(value: string) {
  if (!/^\d{2,25}$/.test(value) || !passesLuhn(value)) return false;
  return Number(value.at(-2)) === value.length % 10;
}

/** Characters in a Bankgirot code line, at ten per inch across the slip. */
export const CODE_LINE_LENGTH = 83;

/**
 * The machine-readable code line ("kodrad") at the foot of a bankgiro
 * payment slip with a fixed amount, as Bankgirot describes it: read from the
 * right, `#41#`, the bankgiro number, `>`, the amount's check digit, öre,
 * kronor, `#`, the OCR reference, `#` and the alignment mark `H`. Bank apps
 * scan it to fill in the bankgiro, amount and OCR number. Null when the
 * details cannot form a valid line.
 */
export function bankgiroCodeLine(input: {
  ocrReference: string;
  amountMinor: number;
  bankgiro: string;
}) {
  const bankgiro = input.bankgiro.replace(/[\s-]/g, "");
  const reference = input.ocrReference.trim();
  if (
    !validBankgiro(bankgiro) ||
    !validOcrReference(reference) ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  )
    return null;
  const kronor = String(Math.floor(input.amountMinor / 100));
  const ore = String(input.amountMinor % 100).padStart(2, "0");
  if (kronor.length > 8) return null;
  const line = Array<string>(CODE_LINE_LENGTH).fill(" ");
  // Positions count from the right, 1 being the last character; values
  // end at their lowest position.
  const put = (endPosition: number, value: string) => {
    [...value].reverse().forEach((char, index) => {
      line[CODE_LINE_LENGTH - (endPosition + index)] = char;
    });
  };
  put(5, "#");
  put(6, "41");
  put(8, "#");
  put(9, bankgiro);
  put(34, ">");
  put(36, String(luhnCheckDigit(`${kronor}${ore}`)));
  put(40, ore);
  put(43, kronor);
  put(51, "#");
  put(53, reference);
  put(79, "#");
  put(83, "H");
  return line.join("");
}
