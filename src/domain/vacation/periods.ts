/** Vacation settings stored on `users/{uid}.vacation`. */
export interface VacationSettings {
  /** Month the vacation year starts, 1-12. */
  resetMonth: number;
  /** Day of month the vacation year starts; clamped to the month's last day. */
  resetDay: number;
  daysPerYear: number;
  /** Vacation pay supplement per day in basis points (80 = 0.8%). */
  supplementBps: number;
}

export interface VacationPeriodBounds {
  /** First day of the period, YYYY-MM-DD. */
  start: string;
  /** Last day of the period, YYYY-MM-DD. */
  end: string;
}

/** One vacation day in minutes; durations stay integer minutes. */
export const VACATION_DAY_MINUTES = 480;

export const DEFAULT_VACATION_SETTINGS: VacationSettings = {
  resetMonth: 4,
  resetDay: 1,
  daysPerYear: 25,
  supplementBps: 80,
};

const DAY_MS = 86_400_000;

function utc(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function format(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return format(utc(date) + days * DAY_MS);
}

/** Days from `start` to `end`, both included; 0 when `end` is before `start`. */
export function daysInclusive(start: string, end: string) {
  return Math.max(0, Math.round((utc(end) - utc(start)) / DAY_MS) + 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The reset date in `year`, with Feb 29 or Apr 31 moved to the month's last day. */
export function resetDateInYear(
  year: number,
  settings: Pick<VacationSettings, "resetMonth" | "resetDay">,
) {
  const day = Math.min(
    settings.resetDay,
    daysInMonth(year, settings.resetMonth),
  );
  return `${year}-${String(settings.resetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The vacation year that contains `date`. */
export function periodContaining(
  date: string,
  settings: Pick<VacationSettings, "resetMonth" | "resetDay">,
): VacationPeriodBounds {
  const year = Number(date.slice(0, 4));
  const thisYear = resetDateInYear(year, settings);
  const start =
    thisYear <= date ? thisYear : resetDateInYear(year - 1, settings);
  const nextStart = resetDateInYear(Number(start.slice(0, 4)) + 1, settings);
  return { start, end: addDays(nextStart, -1) };
}

/** The period after `previous`, ending the day before the next reset date. */
export function periodAfter(
  previous: VacationPeriodBounds,
  settings: Pick<VacationSettings, "resetMonth" | "resetDay">,
): VacationPeriodBounds {
  const start = addDays(previous.end, 1);
  return { start, end: periodContaining(start, settings).end };
}

export function periodId(
  organizationId: string,
  userId: string,
  start: string,
) {
  return `${organizationId}_${userId}_${start}`;
}

/** Whole and half days with one decimal, for display. */
export function minutesToDays(minutes: number) {
  return Math.round((minutes / VACATION_DAY_MINUTES) * 10) / 10;
}

export function daysToMinutes(days: number) {
  return Math.round(days * VACATION_DAY_MINUTES);
}
