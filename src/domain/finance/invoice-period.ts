const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * An invoice's service period is optional, but when given it needs both
 * dates and must not end before it starts.
 */
export function validInvoicePeriod(
  periodFrom: string | null,
  periodTo: string | null,
) {
  if (!periodFrom && !periodTo) return true;
  return Boolean(periodFrom && periodTo && periodTo >= periodFrom);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whole months read "Jan-2026" or "Jan-Feb-2026"; other periods add the
 * days, as in "Aug24-Sep27-2026". A period over New Year names both years:
 * "Dec-2025-Jan-2026" or "Dec24-2025-Jan27-2026".
 */
export function invoicePeriodLabel(periodFrom: string, periodTo: string) {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = periodFrom
    .split("-")
    .map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = periodTo.split("-").map(Number);
  const fromName = MONTHS[fromMonth - 1];
  const toName = MONTHS[toMonth - 1];
  if (!fromName || !toName) return null;
  const wholeMonths =
    fromDay === 1 && toDay === lastDayOfMonth(toYear, toMonth);
  const from = wholeMonths ? fromName : `${fromName}${fromDay}`;
  const to = wholeMonths ? toName : `${toName}${toDay}`;
  if (fromYear !== toYear) return `${from}-${fromYear}-${to}-${toYear}`;
  return from === to ? `${from}-${fromYear}` : `${from}-${to}-${fromYear}`;
}

/**
 * The consultant-visible description for a consultant's invoice:
 * "Consultant services - Anna Berg - Jan-2026". Null without a full period.
 */
export function consultantServicesDescription(
  consultantName: string,
  periodFrom: string | null,
  periodTo: string | null,
) {
  if (!consultantName || !periodFrom || !periodTo) return null;
  if (!validInvoicePeriod(periodFrom, periodTo)) return null;
  const period = invoicePeriodLabel(periodFrom, periodTo);
  return period ? `Consultant services - ${consultantName} - ${period}` : null;
}

/**
 * The internal note for a consultant's invoice: the description with the
 * customer first, "Ework Group AB - Consultant services - Anna Berg - Jan-2026".
 */
export function consultantServicesNote(
  customerName: string,
  consultantName: string,
  periodFrom: string | null,
  periodTo: string | null,
) {
  const description = consultantServicesDescription(
    consultantName,
    periodFrom,
    periodTo,
  );
  if (!description) return null;
  return customerName ? `${customerName} - ${description}` : description;
}
