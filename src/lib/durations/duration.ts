export function parseDuration(hours: number, minutes: number): number {
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid duration");
  }
  const total = hours * 60 + minutes;
  if (total <= 0) throw new Error("Duration must be positive");
  return total;
}

export function formatDuration(
  totalMinutes: number,
  locale: "sv-SE" | "en-SE" = "en-SE",
): string {
  const sign = totalMinutes < 0 ? "−" : "";
  const absolute = Math.abs(totalMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  const hourUnit = locale === "sv-SE" ? "h" : "h";
  const minuteUnit = locale === "sv-SE" ? "min" : "min";
  if (hours === 0) return `${sign}${minutes} ${minuteUnit}`;
  if (minutes === 0) return `${sign}${hours} ${hourUnit}`;
  return `${sign}${hours} ${hourUnit} ${minutes} ${minuteUnit}`;
}
