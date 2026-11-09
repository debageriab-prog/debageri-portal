import { DEFAULT_EMPLOYER_FEE_BPS, employerFeeMinor } from "./totals";

/**
 * Employer contributions (arbetsgivaravgifter) by age, from the year of
 * birth in the personnummer and the year the salary is paid:
 * - `standard`: 31.42 %
 * - `senior`: only the old-age pension fee, 10.21 %, for people who turned 66
 *   before the year began
 * - `none`: nothing for people born 1937 or earlier
 * - `youth`: 20.81 % on pay up to 25 000 kr a month for people who turned 18
 *   but not 23 before the year began, on salaries paid from April 2026 to
 *   September 2027; pay above that has the standard rate
 */
export type EmployerFeeGroup = "standard" | "senior" | "none" | "youth";

export interface EmployerFeeRate {
  group: EmployerFeeGroup;
  /** Rate on pay up to `reducedUpToMinor`, or on all pay without a cap. */
  bps: number;
  /** Pay above this has the standard rate; null when the rate has no cap. */
  reducedUpToMinor: number | null;
}

export const SENIOR_EMPLOYER_FEE_BPS = 1021;
export const YOUTH_EMPLOYER_FEE_BPS = 2081;
export const YOUTH_EMPLOYER_FEE_CAP_MINOR = 2_500_000;
const YOUTH_FROM = "2026-04-01";
const YOUTH_TO = "2027-09-30";

/** The year of birth in a stored `YYYYMMDD-XXXX` personnummer, or null. */
export function birthYear(personalNumber: string | null | undefined) {
  const match = /^(\d{4})\d{4}-\d{4}$/.exec(personalNumber ?? "");
  return match ? Number(match[1]) : null;
}

/** The rate for someone paid on `paymentDate`; standard without a birth year. */
export function employerFeeRate(
  personalNumber: string | null | undefined,
  paymentDate: string,
): EmployerFeeRate {
  const born = birthYear(personalNumber);
  const year = Number(paymentDate.slice(0, 4));
  const standard: EmployerFeeRate = {
    group: "standard",
    bps: DEFAULT_EMPLOYER_FEE_BPS,
    reducedUpToMinor: null,
  };
  if (born === null) return standard;
  if (born <= 1937) return { group: "none", bps: 0, reducedUpToMinor: null };
  // Turned 66 before the year began.
  if (born <= year - 67)
    return {
      group: "senior",
      bps: SENIOR_EMPLOYER_FEE_BPS,
      reducedUpToMinor: null,
    };
  // Turned 18 but not 23 before the year began.
  if (
    paymentDate >= YOUTH_FROM &&
    paymentDate <= YOUTH_TO &&
    born >= year - 23 &&
    born <= year - 19
  )
    return {
      group: "youth",
      bps: YOUTH_EMPLOYER_FEE_BPS,
      reducedUpToMinor: YOUTH_EMPLOYER_FEE_CAP_MINOR,
    };
  return standard;
}

/** Employer contributions on gross pay and benefits, in whole kronor. */
export function ageEmployerFeeMinor(
  taxableMinor: number,
  rate: EmployerFeeRate,
) {
  if (rate.reducedUpToMinor === null)
    return employerFeeMinor(taxableMinor, rate.bps);
  const reduced = Math.min(taxableMinor, rate.reducedUpToMinor);
  const rest = Math.max(0, taxableMinor - rate.reducedUpToMinor);
  return (
    Math.round(
      (reduced * rate.bps + rest * DEFAULT_EMPLOYER_FEE_BPS) / 10_000 / 100,
    ) * 100
  );
}
