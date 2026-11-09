import { dateRuns } from "./runs";

/**
 * Sick pay (sjuklön) under the Swedish Sick Pay Act:
 * - the employer pays 80 % for days 1–14 of a sick pay period, counted in
 *   calendar days, and Försäkringskassan takes over from day 15
 * - each period starts with a waiting-day deduction (karensavdrag) of 20 % of
 *   a week's sick pay, at most the sick pay of the period
 * - falling ill again within five calendar days continues the earlier period:
 *   its days count on and no new waiting-day deduction is made
 * - after ten waiting-day deductions in twelve months no more are made
 */

/** The employer pays sick pay up to and including this day of a period. */
export const SICK_PAY_LAST_DAY = 14;
/** Falling ill again within this many days continues the earlier period. */
export const SICK_RELAPSE_DAYS = 5;
/** No waiting-day deduction after this many in twelve months. */
export const SICK_WAITING_DAYS_PER_YEAR = 10;

export interface SickDay {
  date: string;
  minutes: number;
}

export interface SickPeriodDay extends SickDay {
  /** Calendar day of the sick pay period, from 1. */
  dayNumber: number;
  /** Days 1–14 are paid by the employer, later days by Försäkringskassan. */
  employerPays: boolean;
}

export interface SickPeriod {
  /** First sick day of the period. */
  start: string;
  days: SickPeriodDay[];
  /** Whether the period starts with a waiting-day deduction. */
  waitingDay: boolean;
}

function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
}

function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}

/** The date a year before another, `YYYY-MM-DD`. */
function yearBefore(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCFullYear(day.getUTCFullYear() - 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Sick days grouped into sick pay periods. A run of sick days (weekends and
 * red days between them included) counts every calendar day from its first
 * to its last day; a run starting within five days of the previous one
 * continues its period.
 */
export function sickPeriods(
  sickDays: SickDay[],
  holidays: ReadonlySet<string>,
): SickPeriod[] {
  const minutes = new Map<string, number>();
  for (const day of sickDays)
    if (day.minutes > 0)
      minutes.set(day.date, (minutes.get(day.date) ?? 0) + day.minutes);
  const periods: SickPeriod[] = [];
  let used = 0;
  let lastEnd: string | null = null;
  for (const run of dateRuns([...minutes.keys()], holidays)) {
    const first = run[0]!;
    const last = run.at(-1)!;
    const continues =
      lastEnd !== null && daysBetween(lastEnd, first) - 1 <= SICK_RELAPSE_DAYS;
    if (!continues) {
      const since = yearBefore(first);
      const waitingDays = periods.filter(
        (period) =>
          period.waitingDay && period.start >= since && period.start < first,
      ).length;
      periods.push({
        start: first,
        days: [],
        waitingDay: waitingDays < SICK_WAITING_DAYS_PER_YEAR,
      });
      used = 0;
    }
    const period = periods.at(-1)!;
    for (const date of run) {
      const number = used + daysBetween(first, date) + 1;
      period.days.push({
        date,
        minutes: minutes.get(date)!,
        dayNumber: number,
        employerPays: number <= SICK_PAY_LAST_DAY,
      });
    }
    used += daysBetween(first, last) + 1;
    lastEnd = last;
  }
  return periods;
}

/** Where to start looking for earlier sick days: a year before the period. */
export function sickLookbackFrom(eventFrom: string) {
  return yearBefore(eventFrom);
}
