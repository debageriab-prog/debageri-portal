import { getIsoWeek, getIsoWeekDates } from "@/lib/dates/iso-week";

export const AUTO_REMINDER_KINDS = [
  "firstWorkingDayOfWeek",
  "lastWorkingDayOfWeek",
  "firstWorkingDayOfMonth",
  "lastWorkingDayOfMonth",
] as const;
export type AutoReminderKind = (typeof AUTO_REMINDER_KINDS)[number];
export type AutoReminderSettings = Record<AutoReminderKind, boolean>;

/** Hours in Europe/Stockholm. */
export const MORNING_REMINDER_HOUR = 9;
export const EVENING_REMINDER_HOUR = 17;

/** Every option stays off until someone turns it on. */
export function normalizeAutoReminders(value: unknown): AutoReminderSettings {
  const stored = (value ?? {}) as Partial<Record<AutoReminderKind, unknown>>;
  return Object.fromEntries(
    AUTO_REMINDER_KINDS.map((kind) => [kind, stored[kind] === true]),
  ) as AutoReminderSettings;
}

function isWorkingDay(date: string, holidays: Set<string>) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !holidays.has(date);
}

function datesInMonth(date: string) {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, index) => `${date.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`,
  );
}

/** Returns the enabled reminders that fall on this date and Stockholm hour. */
export function dueAutoReminders(
  settings: AutoReminderSettings,
  date: string,
  hour: number,
  holidays: Set<string>,
) {
  if (!isWorkingDay(date, holidays)) return [];
  const { isoYear, isoWeek } = getIsoWeek(date);
  const week = getIsoWeekDates(isoYear, isoWeek).filter((day) =>
    isWorkingDay(day, holidays),
  );
  const month = datesInMonth(date).filter((day) => isWorkingDay(day, holidays));
  const due: Array<[AutoReminderKind, number, boolean]> = [
    ["firstWorkingDayOfWeek", MORNING_REMINDER_HOUR, week[0] === date],
    ["lastWorkingDayOfWeek", EVENING_REMINDER_HOUR, week.at(-1) === date],
    ["firstWorkingDayOfMonth", MORNING_REMINDER_HOUR, month[0] === date],
    ["lastWorkingDayOfMonth", EVENING_REMINDER_HOUR, month.at(-1) === date],
  ];
  return due
    .filter(
      ([kind, kindHour, matches]) =>
        settings[kind] && kindHour === hour && matches,
    )
    .map(([kind]) => kind);
}
