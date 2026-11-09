import { appCheckFetch } from "@/lib/firebase/client";

/** Runs a finance action; returns the error code, or null on success. */
export async function postSalaryAction(payload: Record<string, unknown>) {
  try {
    const response = await appCheckFetch("/api/finance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return null;
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    return result.error ?? "financeOperationFailed";
  } catch {
    return "serverUnavailable";
  }
}

/** `2026-08` → the next or previous month. */
export function shiftMonth(period: string, months: number) {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/** Amount text as typed, with a comma or point and an optional minus. */
export function parseMoney(value: string) {
  const normalized = value.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Hundredths from a quantity typed with up to two decimals. */
export function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** `1 070,40` from öre or hundredths, in the reader's locale. */
export function formatHundredths(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatKronor(minor: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.trunc(minor / 100),
  );
}
