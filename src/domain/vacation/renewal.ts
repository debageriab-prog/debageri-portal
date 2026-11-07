import {
  daysInclusive,
  VACATION_DAY_MINUTES,
  type VacationPeriodBounds,
} from "./periods";

/** Days of `period` the person was employed, from start and end dates. */
export function employedDays(
  period: VacationPeriodBounds,
  employmentStartDate: string | null,
  employmentEndDate: string | null,
) {
  const start =
    employmentStartDate && employmentStartDate > period.start
      ? employmentStartDate
      : period.start;
  const end =
    employmentEndDate && employmentEndDate < period.end
      ? employmentEndDate
      : period.end;
  return daysInclusive(start, end);
}

/**
 * Whole days earned for the next period: `daysPerYear` pro-rated by the days
 * employed in the previous period and rounded up, as semesterlagen does.
 */
export function earnedDays(
  daysPerYear: number,
  employed: number,
  periodDays: number,
) {
  if (periodDays <= 0 || employed <= 0 || daysPerYear <= 0) return 0;
  const days = Math.min(employed, periodDays);
  return Math.floor((daysPerYear * days + periodDays - 1) / periodDays);
}

export function earnedMinutes(
  daysPerYear: number,
  previous: VacationPeriodBounds,
  employmentStartDate: string | null,
  employmentEndDate: string | null,
) {
  return (
    earnedDays(
      daysPerYear,
      employedDays(previous, employmentStartDate, employmentEndDate),
      daysInclusive(previous.start, previous.end),
    ) * VACATION_DAY_MINUTES
  );
}
