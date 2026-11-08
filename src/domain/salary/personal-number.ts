/**
 * Swedish personal identity numbers (personnummer), including coordination
 * numbers (samordningsnummer, where 60 is added to the day). Stored as
 * `YYYYMMDD-XXXX`.
 */

function luhnValid(tenDigits: string) {
  let sum = 0;
  for (let index = 0; index < tenDigits.length; index += 1) {
    let digit = Number(tenDigits[index]) * (index % 2 === 0 ? 2 : 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

function validDate(year: number, month: number, day: number) {
  // A coordination number adds 60 to the day of birth.
  const birthDay = day > 60 ? day - 60 : day;
  const date = new Date(Date.UTC(year, month - 1, birthDay));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === birthDay
  );
}

/**
 * The number as `YYYYMMDD-XXXX`, or null when it is not a valid personnummer.
 * Ten-digit input takes the century from `today`; a `+` separator marks
 * someone 100 or older.
 */
export function normalizePersonalNumber(
  value: string,
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  const trimmed = value.trim();
  const match = /^(\d{2})?(\d{6})([-+]?)(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, century, birth = "", separator, serial = ""] = match;
  const shortYear = Number(birth.slice(0, 2));
  let fullYear: number;
  if (century) {
    if (separator === "+") return null;
    fullYear = Number(`${century}${birth.slice(0, 2)}`);
  } else {
    const currentYear = Number(today.slice(0, 4));
    fullYear = Math.floor(currentYear / 100) * 100 + shortYear;
    if (fullYear > currentYear) fullYear -= 100;
    if (separator === "+") fullYear -= 100;
  }
  const month = Number(birth.slice(2, 4));
  const day = Number(birth.slice(4, 6));
  if (!validDate(fullYear, month, day)) return null;
  if (!luhnValid(`${birth}${serial}`)) return null;
  return `${fullYear}${birth.slice(2)}-${serial}`;
}
