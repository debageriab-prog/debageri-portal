import { datesBetween, isWorkingDay } from "@/domain/time/working-days";

/**
 * Dates grouped into runs, where only weekends and red days may lie between
 * two dates of the same run: a Friday and the Monday after belong together.
 */
export function dateRuns(dates: string[], holidays: ReadonlySet<string>) {
  const sorted = [...new Set(dates)].sort();
  const runs: string[][] = [];
  for (const date of sorted) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    const gapIsFree =
      last !== undefined &&
      datesBetween(last, date)
        .slice(1, -1)
        .every((day) => !isWorkingDay(day, holidays));
    if (run && gapIsFree) run.push(date);
    else runs.push([date]);
  }
  return runs;
}
