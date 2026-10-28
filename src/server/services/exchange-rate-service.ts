import "server-only";

import type { SekExchangeRate } from "@/domain/ai";

const TIMEOUT_MS = 8_000;

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function getJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Exchange rate request failed: ${url}`);
  return (await response.json()) as unknown;
}

/** Riksbank daily mid rate, SEK per unit, on the last banking day <= date. */
async function riksbankRate(
  currency: string,
  date: string,
): Promise<SekExchangeRate | null> {
  const observations = (await getJson(
    `https://api.riksbank.se/swea/v1/Observations/SEK${currency}PMI/${daysBefore(date, 10)}/${date}`,
  )) as { date?: string; value?: number }[];
  const latest = Array.isArray(observations)
    ? observations
        .filter(
          (item) =>
            typeof item.date === "string" &&
            typeof item.value === "number" &&
            item.value > 0,
        )
        .at(-1)
    : undefined;
  return latest
    ? { rate: latest.value!, date: latest.date!, source: "riksbank" }
    : null;
}

/** ECB reference rate via Frankfurter, used when the Riksbank is unavailable. */
async function ecbRate(
  currency: string,
  date: string,
): Promise<SekExchangeRate | null> {
  const result = (await getJson(
    `https://api.frankfurter.dev/v1/${date}?base=${currency}&symbols=SEK`,
  )) as { date?: string; rates?: { SEK?: number } };
  const rate = result.rates?.SEK;
  return typeof rate === "number" && rate > 0 && result.date
    ? { rate, date: result.date, source: "ecb" }
    : null;
}

/**
 * The official rate for converting `currency` to SEK on `date`, or null when
 * no source has one. Future dates use today's rate.
 */
export async function sekExchangeRate(
  currency: string,
  date: string,
): Promise<SekExchangeRate | null> {
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const day = date > today ? today : date;
  for (const source of [riksbankRate, ecbRate]) {
    try {
      const rate = await source(currency, day);
      if (rate) return rate;
    } catch (error) {
      console.warn("Exchange rate lookup failed", { currency, day, error });
    }
  }
  return null;
}
