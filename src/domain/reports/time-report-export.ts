/**
 * Builds the Excel time report: one tab per time code, a row per day of the
 * month and a column per month, with weekends and red days marked.
 */

export type ExportEntry = {
  date: string;
  minutes: number;
  timeCodeId: string;
  name: string;
  countsAsWorkedTime: boolean;
};

/** A month from 1 to 12, or the whole year when left out. */
export type ExportPeriod = { year: number; month?: number };

export type ExportDay =
  { kind: "missing" } | { kind: "workday" | "closed"; minutes: number | null };

export type ExportSheet = {
  name: string;
  months: number[];
  /** days[dayIndex][monthIndex] for day 1 to 31. */
  days: ExportDay[][];
  totalMinutes: number[];
  possibleMinutes: number[];
};

export const WORKDAY_MINUTES = 480;

/** Header colours per month, January first, shared by Excel and PDF. */
export const MONTH_COLORS = [
  "D9EAD3",
  "B4A7D6",
  "A4C2F4",
  "FCE5CD",
  "F4CCCC",
  "CCCCCC",
  "EAD1DC",
  "E6B8AF",
  "D9D2E9",
  "FFE599",
  "F4CCCC",
  "A4C2F4",
];
export const CLOSED_COLOR = "E06666";
export const MISSING_COLOR = "999999";
export const TOTAL_COLOR = "B6D7A8";
export const MUTED_TEXT_COLOR = "B7B7B7";

const pad = (value: number) => String(value).padStart(2, "0");

export const isValidExportPeriod = ({ year, month }: ExportPeriod) =>
  Number.isInteger(year) &&
  year >= 2000 &&
  year <= 2100 &&
  (month === undefined ||
    (Number.isInteger(month) && month >= 1 && month <= 12));

export const exportPeriodBounds = ({ year, month }: ExportPeriod) =>
  month
    ? ([
        `${year}-${pad(month)}-01`,
        `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
      ] as const)
    : ([`${year}-01-01`, `${year}-12-31`] as const);

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isClosed(date: string, holidays: ReadonlySet<string>) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.has(date);
}

/** Excel refuses tab names over 31 characters or with []:*?/\ in them. */
export function sheetNames(names: readonly string[]) {
  const used = new Set<string>();
  return names.map((raw) => {
    const base =
      raw
        .replace(/[[\]:*?/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^'+|'+$/g, "")
        .slice(0, 31)
        .trim() || "Sheet";
    let name = base;
    for (let copy = 2; used.has(name.toLowerCase()); copy += 1) {
      const suffix = ` (${copy})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * Groups the period's entries by time code, worked codes first. Without any
 * entries there is still one empty tab, named by `emptyName`.
 */
export function buildExportSheets(
  entries: readonly ExportEntry[],
  period: ExportPeriod,
  holidayDates: readonly string[],
  emptyName: string,
): ExportSheet[] {
  const [start, end] = exportPeriodBounds(period);
  const holidays = new Set(holidayDates);
  const months = period.month
    ? [period.month]
    : Array.from({ length: 12 }, (_, index) => index + 1);
  const codes = new Map<
    string,
    { name: string; worked: boolean; minutes: Map<string, number> }
  >();
  for (const entry of entries) {
    if (entry.date < start || entry.date > end) continue;
    const code = codes.get(entry.timeCodeId) ?? {
      name: entry.name,
      worked: entry.countsAsWorkedTime,
      minutes: new Map<string, number>(),
    };
    code.minutes.set(
      entry.date,
      (code.minutes.get(entry.date) ?? 0) + entry.minutes,
    );
    codes.set(entry.timeCodeId, code);
  }
  const ordered = [...codes.values()].sort(
    (left, right) =>
      Number(right.worked) - Number(left.worked) ||
      left.name.localeCompare(right.name),
  );
  const groups = ordered.length
    ? ordered
    : [{ name: emptyName, worked: true, minutes: new Map<string, number>() }];
  const possibleMinutes = months.map((month) => {
    let workdays = 0;
    for (let day = 1; day <= daysInMonth(period.year, month); day += 1)
      if (!isClosed(`${period.year}-${pad(month)}-${pad(day)}`, holidays))
        workdays += 1;
    return workdays * WORKDAY_MINUTES;
  });
  const names = sheetNames(groups.map((group) => group.name));
  return groups.map((group, groupIndex) => {
    const days = Array.from({ length: 31 }, (_, dayIndex) =>
      months.map((month): ExportDay => {
        if (dayIndex + 1 > daysInMonth(period.year, month))
          return { kind: "missing" };
        const date = `${period.year}-${pad(month)}-${pad(dayIndex + 1)}`;
        return {
          kind: isClosed(date, holidays) ? "closed" : "workday",
          minutes: group.minutes.get(date) ?? null,
        };
      }),
    );
    const totalMinutes = months.map((_, monthIndex) =>
      days.reduce((sum, row) => {
        const day = row[monthIndex]!;
        return sum + (day.kind === "missing" ? 0 : (day.minutes ?? 0));
      }, 0),
    );
    return {
      name: names[groupIndex]!,
      months,
      days,
      totalMinutes,
      possibleMinutes,
    };
  });
}

export type ExportFormat = "xlsx" | "pdf";

/** TimeReport_ConsultantName_Year_Month, or without the month for a year. */
export function exportFileName(
  displayName: string,
  period: ExportPeriod,
  format: ExportFormat = "xlsx",
) {
  const name =
    displayName.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "") ||
    "Consultant";
  return `TimeReport_${name}_${period.year}${period.month ? `_${pad(period.month)}` : ""}.${format}`;
}

/**
 * Whose time reports staff may open: consultants for everyone with access,
 * and managers or accountants who report time only for admins.
 */
export function reportVisibleTo(
  actorRole: string,
  user: { role: unknown; reportsTime?: unknown },
) {
  const role = String(user.role);
  if (["employee", "consultant"].includes(role)) return true;
  return (
    actorRole === "admin" &&
    ["manager", "accountant"].includes(role) &&
    user.reportsTime === true
  );
}
