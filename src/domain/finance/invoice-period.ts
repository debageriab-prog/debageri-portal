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

/** "Jan-2026", "Jan-Feb-2026" or "Dec-2025-Jan-2026" for a service period. */
export function invoicePeriodLabel(periodFrom: string, periodTo: string) {
  const [fromYear, fromMonth] = periodFrom.split("-").map(Number);
  const [toYear, toMonth] = periodTo.split("-").map(Number);
  const from = MONTHS[(fromMonth ?? 0) - 1];
  const to = MONTHS[(toMonth ?? 0) - 1];
  if (!from || !to) return null;
  if (fromYear !== toYear) return `${from}-${fromYear}-${to}-${toYear}`;
  return fromMonth === toMonth
    ? `${from}-${fromYear}`
    : `${from}-${to}-${fromYear}`;
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
