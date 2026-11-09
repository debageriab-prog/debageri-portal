/** Weekdays that are not red days, and the minutes a full month expects. */

/** One full working day in minutes. */
export const WORKDAY_MINUTES = 480;

export function isWorkingDay(date: string, holidays: ReadonlySet<string>) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !holidays.has(date);
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const day = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (day <= end) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

/** The `YYYY-MM` month before another. */
export function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return number === 1
    ? `${year - 1}-12`
    : `${year}-${String(number - 1).padStart(2, "0")}`;
}

/** Minutes a full-time person is expected to work between two dates. */
export function expectedMinutes(
  from: string,
  to: string,
  holidays: ReadonlySet<string>,
) {
  return (
    datesBetween(from, to).filter((date) => isWorkingDay(date, holidays))
      .length * WORKDAY_MINUTES
  );
}
