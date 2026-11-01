import type { CompensationAgreement } from "@/domain/types";

export type IncomeAgreement = Pick<
  CompensationAgreement,
  "model" | "validFrom" | "validTo" | "shareBps"
>;

export interface EstimatedIncome {
  worked: number;
  notReached: number;
  /** Locale key naming the figure. */
  label: "estimatedIncome" | "estimatedExtraIncome";
}

function agreementOn(agreements: IncomeAgreement[], date: string) {
  const latest = agreements
    .filter((agreement) => agreement.validFrom <= date)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  return latest && (!latest.validTo || latest.validTo >= date)
    ? latest
    : undefined;
}

/** The part of a day's value the consultant sees as their own income. */
function incomeShare(agreement: IncomeAgreement | undefined) {
  if (agreement?.model === "flexible") return 1;
  if (agreement?.model === "hybrid") return agreement.shareBps / 10_000;
  return 0;
}

/**
 * What a consultant sees of their own estimated income. Each day follows the
 * agreement valid that day: flexible days count in full, hybrid days count the
 * invoice share only, and fixed days or days without an agreement do not count.
 * Returns null when no working day in the period counts.
 */
export function consultantIncome(
  entries: Array<{
    date: string;
    minutes: number;
    countsAsWorkedTime: boolean;
    hourlyRate?: number;
  }>,
  workingDates: string[],
  hourlyRate: number,
  agreements: IncomeAgreement[],
): EstimatedIncome | null {
  const models = new Set(
    workingDates.map((date) => agreementOn(agreements, date)?.model),
  );
  if (!models.has("flexible") && !models.has("hybrid")) return null;

  const worked = entries
    .filter((entry) => entry.countsAsWorkedTime)
    .reduce(
      (sum, entry) =>
        sum +
        (entry.minutes / 60) *
          (entry.hourlyRate ?? hourlyRate) *
          incomeShare(agreementOn(agreements, entry.date)),
      0,
    );
  const possible = workingDates.reduce(
    (sum, date) =>
      sum + 8 * hourlyRate * incomeShare(agreementOn(agreements, date)),
    0,
  );
  return {
    worked,
    notReached: Math.max(0, possible - worked),
    label: models.has("flexible") ? "estimatedIncome" : "estimatedExtraIncome",
  };
}
