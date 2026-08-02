export type TransactionPeriod = "month" | "year";

type SearchParamsReader = { get(name: string): string | null };

export function transactionListState(
  searchParams: SearchParamsReader,
  fallbackAnchor: string,
) {
  const requestedPeriod = searchParams.get("period");
  const period: TransactionPeriod =
    requestedPeriod === "year" ? "year" : "month";
  const requestedAnchor = searchParams.get("anchor") ?? "";
  const validAnchor = /^\d{4}-\d{2}$/.test(requestedAnchor)
    ? requestedAnchor
    : fallbackAnchor;
  const requestedScope = searchParams.get("scope") ?? "";
  const scope =
    requestedScope.length > 0 && requestedScope.length <= 128
      ? requestedScope
      : "all";
  return { scope, period, anchor: validAnchor };
}

export function transactionListHref(state: {
  scope: string;
  period: TransactionPeriod;
  anchor: string;
}) {
  const params = new URLSearchParams({
    section: "transactions",
    scope: state.scope,
    period: state.period,
    anchor: state.anchor,
  });
  return `/finance?${params.toString()}`;
}

export function safeTransactionReturnHref(value: unknown) {
  const fallback = "/finance?section=transactions";
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value, "https://portal.invalid");
    if (
      url.origin !== "https://portal.invalid" ||
      url.pathname !== "/finance" ||
      url.searchParams.get("section") !== "transactions"
    )
      return fallback;
    const requestedAnchor = url.searchParams.get("anchor") ?? "";
    const requestedScope = url.searchParams.get("scope") ?? "";
    if (
      !/^\d{4}-\d{2}$/.test(requestedAnchor) ||
      requestedScope.length === 0 ||
      requestedScope.length > 128
    )
      return fallback;
    return transactionListHref({
      scope: requestedScope,
      period: url.searchParams.get("period") === "year" ? "year" : "month",
      anchor: requestedAnchor,
    });
  } catch {
    return fallback;
  }
}

export function transactionDefaultDate(
  returnHref: string,
  currentDate: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return currentDate;
  const viewMonth = transactionViewMonth(returnHref);
  if (!viewMonth) return currentDate;
  const year = Number(viewMonth.slice(0, 4));
  const month = Number(viewMonth.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(currentDate.slice(8, 10)), lastDay);
  return `${viewMonth}-${String(day).padStart(2, "0")}`;
}

export function transactionViewMonth(returnHref: string) {
  try {
    const params = new URL(returnHref, "https://portal.invalid").searchParams;
    const anchor = params.get("anchor") ?? "";
    if (params.get("period") !== "month" || !/^\d{4}-\d{2}$/.test(anchor))
      return null;
    const month = Number(anchor.slice(5, 7));
    return month >= 1 && month <= 12 ? anchor : null;
  } catch {
    return null;
  }
}

export function transactionMonthMismatch(
  returnHref: string,
  transactionDate: string,
) {
  const viewMonth = transactionViewMonth(returnHref);
  const transactionMonth = /^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
    ? transactionDate.slice(0, 7)
    : null;
  return viewMonth && transactionMonth && viewMonth !== transactionMonth
    ? { viewMonth, transactionMonth }
    : null;
}
