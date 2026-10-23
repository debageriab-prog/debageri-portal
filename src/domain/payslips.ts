export const PAYSLIP_MAX_BYTES = 5 * 1024 * 1024;
export const PAYSLIP_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function payslipPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function payslipId(
  organizationId: string,
  userId: string,
  period: string,
) {
  return `${organizationId}_${userId}_${period}`;
}

export function isPayslipContentType(type: string) {
  return (PAYSLIP_CONTENT_TYPES as readonly string[]).includes(type);
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Suggests the recipient of a pay slip file from its name. An employee number
 * or the full display name must appear as whole words; ambiguous matches
 * return null so the uploader picks the person explicitly.
 */
export function matchPayslipRecipient(
  fileName: string,
  recipients: { id: string; name: string; employeeNumber: string }[],
) {
  const words = ` ${normalize(fileName.replace(/\.[^.]+$/, ""))} `;
  const contains = (value: string) => {
    const needle = normalize(value);
    return needle.length > 0 && words.includes(` ${needle} `);
  };
  const byNumber = recipients.filter((item) => contains(item.employeeNumber));
  if (byNumber.length === 1) return byNumber[0]!.id;
  const byName = recipients.filter((item) => contains(item.name));
  return byName.length === 1 ? byName[0]!.id : null;
}

export function formatPayslipMonth(
  locale: string,
  year: number,
  month: number,
) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, 1));
}
