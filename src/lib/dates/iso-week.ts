const DAY_MS = 86_400_000;

export function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid ISO date");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || toIsoDate(date) !== value)
    throw new Error("Invalid ISO date");
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getIsoWeek(dateInput: Date | string): {
  isoYear: number;
  isoWeek: number;
} {
  const source =
    typeof dateInput === "string" ? parseIsoDate(dateInput) : dateInput;
  const date = new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth(),
      source.getUTCDate(),
    ),
  );
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((date.valueOf() - yearStart.valueOf()) / DAY_MS + 1) / 7,
  );
  return { isoYear, isoWeek };
}

export function getIsoWeekDates(isoYear: number, isoWeek: number): string[] {
  if (
    !Number.isInteger(isoYear) ||
    !Number.isInteger(isoWeek) ||
    isoWeek < 1 ||
    isoWeek > 53
  ) {
    throw new Error("Invalid ISO week");
  }
  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(
    januaryFourth.getUTCDate() - weekday + 1 + (isoWeek - 1) * 7,
  );
  if (
    getIsoWeek(monday).isoYear !== isoYear ||
    getIsoWeek(monday).isoWeek !== isoWeek
  ) {
    throw new Error("ISO week does not exist");
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return toIsoDate(date);
  });
}

export function timesheetId(
  organizationId: string,
  userId: string,
  isoYear: number,
  isoWeek: number,
): string {
  return `${organizationId}_${userId}_${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export function splitWeekByMonth(dates: string[]): string[][] {
  return dates.reduce<string[][]>((parts, date) => {
    const current = parts.at(-1);
    if (!current || current[0]?.slice(0, 7) !== date.slice(0, 7))
      parts.push([date]);
    else current.push(date);
    return parts;
  }, []);
}

export function timesheetPartId(
  organizationId: string,
  userId: string,
  isoYear: number,
  isoWeek: number,
  part: number,
  partCount: number,
): string {
  const base = timesheetId(organizationId, userId, isoYear, isoWeek);
  return partCount > 1 ? `${base}-P${String(part).padStart(2, "0")}` : base;
}
