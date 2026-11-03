import { stockholmDateTime } from "./stockholm";

/** `YYYY-MM` moved by whole months. */
export function shiftMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

export function isMonth(value: string | null | undefined): value is string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "");
}

/** The moment a calendar month (`YYYY-MM`) starts in Europe/Stockholm. */
export function stockholmMonthStart(month: string) {
  const midnightUtc = Date.UTC(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)) - 1,
    1,
  );
  // Stockholm is one hour ahead of UTC in winter and two in summer.
  for (const hours of [1, 2]) {
    const candidate = new Date(midnightUtc - hours * 3_600_000);
    const local = stockholmDateTime(candidate);
    if (local.date === `${month}-01` && local.hour === 0) return candidate;
  }
  throw new Error(`No Stockholm midnight for ${month}`);
}
