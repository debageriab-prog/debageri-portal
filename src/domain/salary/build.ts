import type { CompensationAgreement, TimeCategory } from "@/domain/types";
import { monthlySalaryMinor } from "@/domain/finance/compensation";
import { monthBounds, WORKDAY_MINUTES } from "@/domain/time/working-days";
import type { SalaryArticle, SalaryLine } from "./articles";
import { dateRuns } from "./runs";
import { sickPeriods, type SickDay } from "./sick-pay";

export { dateRuns };

/** Full-time hours a week, used to turn a monthly salary into an hourly one. */
const WEEKLY_HOURS = 40;
/** Sick pay (sjuklön) is 80 % of pay, so 20 % of each sick hour is deducted. */
const SICK_DEDUCTION_BPS = 2000;
/** Unpaid vacation takes 4.6 % of the monthly salary per day. */
const UNPAID_VACATION_DAY_BPS = 460;

export interface SalaryTimeEntry {
  date: string;
  minutes: number;
  category: TimeCategory;
}

export interface SalaryBuildInput {
  /** The month paid, `YYYY-MM`. */
  period: string;
  agreement: Pick<
    CompensationAgreement,
    "model" | "fixedMonthlySalaryMinor" | "requestedMonthlySalaryMinor"
  >;
  /** Vacation pay supplement per day in basis points of the monthly salary. */
  supplementBps: number;
  /** Days, events and red days come from this period (usually last month). */
  eventFrom: string;
  eventTo: string;
  /** Approved time in the event period. */
  entries: SalaryTimeEntry[];
  holidays: ReadonlySet<string>;
  /** Vacation days in the event period that the balance does not cover. */
  unpaidVacationDays?: number;
  /**
   * Approved sick days in the twelve months before the event period, so a
   * sick pay period that began earlier counts on and the waiting-day limit
   * holds.
   */
  earlierSick?: SickDay[];
}

/** Monthly salary per hour: × 12 months ÷ (52 weeks × 40 hours). */
export function hourlyRateMinor(monthlyMinor: number) {
  return Math.round((monthlyMinor * 12) / (52 * WEEKLY_HOURS));
}

function line(
  id: string,
  article: SalaryArticle,
  values: Partial<SalaryLine> &
    Pick<SalaryLine, "quantityHundredths" | "unitPriceMinor">,
): SalaryLine {
  return {
    id,
    article,
    label: "",
    from: null,
    to: null,
    scopeBps: 10_000,
    manual: false,
    ...values,
  };
}

/** Minutes of one category, per date. */
function minutesByDate(entries: SalaryTimeEntry[], categories: TimeCategory[]) {
  const totals = new Map<string, number>();
  for (const entry of entries)
    if (categories.includes(entry.category))
      totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.minutes);
  return totals;
}

/** Hundredths of a day, from minutes. */
function dayHundredths(minutes: number) {
  return Math.round((minutes * 100) / WORKDAY_MINUTES);
}

/**
 * The suggested lines of one person's monthly salary: the monthly salary for
 * the paid month, and supplements and deductions for what happened in the
 * event period. Every amount can be changed afterwards.
 */
export function buildSalaryLines(input: SalaryBuildInput): SalaryLine[] {
  const monthly = monthlySalaryMinor(input.agreement);
  const paid = monthBounds(input.period);
  const lines: SalaryLine[] = [];
  if (monthly <= 0) return lines;
  lines.push(
    line("monthlySalary", "monthlySalary", {
      from: paid.from,
      to: paid.to,
      quantityHundredths: 100,
      unitPriceMinor: monthly,
    }),
  );

  // Vacation supplement (semestertillägg) per run of vacation days.
  const vacation = minutesByDate(input.entries, ["vacation"]);
  const supplement = Math.round((monthly * input.supplementBps) / 10_000);
  if (supplement > 0)
    for (const run of dateRuns([...vacation.keys()], input.holidays)) {
      const minutes = run.reduce((sum, date) => sum + vacation.get(date)!, 0);
      lines.push(
        line(`vacationSupplement-${run[0]}`, "vacationSupplement", {
          from: run[0]!,
          to: run.at(-1)!,
          quantityHundredths: dayHundredths(minutes),
          unitPriceMinor: supplement,
        }),
      );
    }

  if (input.unpaidVacationDays && input.unpaidVacationDays > 0)
    lines.push(
      line("unpaidVacation", "unpaidVacation", {
        from: input.eventFrom,
        to: input.eventTo,
        quantityHundredths: Math.round(input.unpaidVacationDays * 100),
        unitPriceMinor: -Math.round(
          (monthly * UNPAID_VACATION_DAY_BPS) / 10_000,
        ),
      }),
    );

  // Unpaid absence is deducted by the hour.
  const hourly = hourlyRateMinor(monthly);
  const absences: Array<[SalaryArticle, TimeCategory]> = [
    ["unpaidLeave", "unpaid_leave"],
    ["parentalLeave", "parental_leave"],
    ["careLeave", "care_leave"],
  ];
  for (const [article, category] of absences) {
    const byDate = minutesByDate(input.entries, [category]);
    for (const run of dateRuns([...byDate.keys()], input.holidays)) {
      const minutes = run.reduce((sum, date) => sum + byDate.get(date)!, 0);
      lines.push(
        line(`${article}-${run[0]}`, article, {
          from: run[0]!,
          to: run.at(-1)!,
          quantityHundredths: Math.round((minutes * 100) / 60),
          unitPriceMinor: -hourly,
        }),
      );
    }
  }

  // Sick pay is 80 % for days 1–14 of a sick pay period, so 20 % of each
  // sick hour is deducted; from day 15 Försäkringskassan pays and the whole
  // hour is deducted. Each period starts with a waiting-day deduction of 20 %
  // of a week's sick pay, at most the sick pay of the period.
  const sickDays: SickDay[] = [
    ...(input.earlierSick ?? []).filter((day) => day.date < input.eventFrom),
    ...input.entries
      .filter((entry) => entry.category === "sick_leave")
      .map(({ date, minutes }) => ({ date, minutes })),
  ];
  const inEvent = (date: string) =>
    date >= input.eventFrom && date <= input.eventTo;
  const sickHourly = Math.round((hourly * SICK_DEDUCTION_BPS) / 10_000);
  const weeklySickPay = Math.round(
    (hourly * WEEKLY_HOURS * (10_000 - SICK_DEDUCTION_BPS)) / 10_000,
  );
  for (const period of sickPeriods(sickDays, input.holidays)) {
    const days = period.days.filter((day) => inEvent(day.date));
    if (!days.length) continue;
    for (const employerPays of [true, false]) {
      const part = days.filter((day) => day.employerPays === employerPays);
      for (const run of dateRuns(
        part.map((day) => day.date),
        input.holidays,
      )) {
        const minutes = part
          .filter((day) => run.includes(day.date))
          .reduce((sum, day) => sum + day.minutes, 0);
        const article = employerPays ? "sickLeave" : "sickLeaveFull";
        lines.push(
          line(`${article}-${run[0]}`, article, {
            from: run[0]!,
            to: run.at(-1)!,
            quantityHundredths: Math.round((minutes * 100) / 60),
            unitPriceMinor: employerPays ? -sickHourly : -hourly,
          }),
        );
      }
    }
    if (period.waitingDay && inEvent(period.start)) {
      const paidMinutes = period.days
        .filter((day) => day.employerPays)
        .reduce((sum, day) => sum + day.minutes, 0);
      const sickPay = Math.round(
        (((hourly * paidMinutes) / 60) * (10_000 - SICK_DEDUCTION_BPS)) /
          10_000,
      );
      lines.push(
        line(`sickWaitingDay-${period.start}`, "sickWaitingDay", {
          from: period.start,
          to: period.start,
          quantityHundredths: 100,
          unitPriceMinor: -Math.min(
            Math.round((weeklySickPay * 2000) / 10_000),
            sickPay,
          ),
        }),
      );
    }
  }
  return lines;
}
