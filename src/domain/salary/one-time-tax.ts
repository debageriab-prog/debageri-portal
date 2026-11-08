/**
 * Engångsskatt: tax on one-time payments such as a bonus, commission or
 * retroactive pay. These are taxed apart from the monthly salary, at a percent
 * from Skatteverket's tables for engångsbelopp that depends on the expected
 * annual income and the person's table column.
 *
 * Skatteverket publishes the tables yearly as a regulation (for 2026 SKVFS
 * 2025:21), not as open data, so each year's table is added here.
 */

import type { TaxColumn } from "./tax";

/** One bracket: annual income up to `to` whole kronor is taxed `percent`. */
interface OneTimeBracket {
  /** Inclusive upper limit in whole kronor; null for the top bracket. */
  to: number | null;
  percent: number;
}

type OneTimeTable = Record<TaxColumn, OneTimeBracket[]>;

const brackets = (...pairs: Array<[number | null, number]>) =>
  pairs.map(([to, percent]) => ({ to, percent }));

/** Tables for engångsbelopp by tax year (SKVFS 2025:21 for 2026). */
export const ONE_TIME_TAX_TABLES: Record<number, OneTimeTable> = {
  2026: {
    1: brackets(
      [25_041, 0],
      [82_800, 10],
      [192_000, 21],
      [477_600, 26],
      [660_000, 34],
      [null, 54],
    ),
    2: brackets([65_800, 0], [477_600, 26], [660_000, 34], [null, 55]),
    3: brackets(
      [25_041, 0],
      [331_200, 10],
      [477_600, 26],
      [660_000, 34],
      [null, 55],
    ),
    4: brackets(
      [25_041, 0],
      [54_000, 3],
      [192_000, 22],
      [660_000, 26],
      [null, 46],
    ),
    5: brackets(
      [25_041, 0],
      [32_400, 10],
      [160_800, 29],
      [184_800, 34],
      [660_000, 38],
      [null, 54],
    ),
    6: brackets(
      [25_041, 0],
      [160_800, 29],
      [184_800, 34],
      [660_000, 38],
      [null, 54],
    ),
  },
};

/** Without a time-bound salary, one-time payments are taxed 30 %. */
export const ONE_TIME_TAX_WITHOUT_SALARY_PERCENT = 30;

/**
 * The expected annual income the percent is chosen from: this month's
 * regular taxable pay for a whole year, plus this and earlier one-time
 * payments of the year.
 */
export function expectedAnnualIncomeMinor(input: {
  regularTaxableMinor: number;
  oneTimeMinor: number;
  oneTimeEarlierMinor: number;
}) {
  return (
    input.regularTaxableMinor * 12 +
    input.oneTimeMinor +
    input.oneTimeEarlierMinor
  );
}

/**
 * The percent withheld on one-time payments, or null when no table for the
 * year is known yet.
 */
export function oneTimeTaxPercent(
  year: number,
  column: TaxColumn,
  input: {
    regularTaxableMinor: number;
    oneTimeMinor: number;
    oneTimeEarlierMinor: number;
  },
): number | null {
  if (input.regularTaxableMinor <= 0)
    return ONE_TIME_TAX_WITHOUT_SALARY_PERCENT;
  const table = ONE_TIME_TAX_TABLES[year]?.[column];
  if (!table) return null;
  const kronor = Math.floor(expectedAnnualIncomeMinor(input) / 100);
  const bracket = table.find((item) => item.to === null || kronor <= item.to);
  return bracket?.percent ?? null;
}

/** Tax on the one-time amount, rounded down to whole kronor. */
export function oneTimeTaxMinor(oneTimeMinor: number, percent: number) {
  if (oneTimeMinor <= 0) return 0;
  return Math.floor((oneTimeMinor * percent) / 100 / 100) * 100;
}

/** Items that are usually one-time payments, so the box starts ticked. */
export const ONE_TIME_ITEMS = ["bonus", "commission"] as const;
