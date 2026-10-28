/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value;
}

/**
 * Turns typed dates such as "20261003", "2026/10/03" or "2026-10-3" into
 * "2026-10-03". Anything else is returned trimmed and unchanged.
 */
export function normalizeDateText(value: string) {
  const text = value.trim();
  const match = /^(\d{4})[-/. ]?(\d{1,2})[-/. ]?(\d{1,2})$/.exec(text);
  if (!match) return text;
  if (!/[-/. ]/.test(text) && text.length !== 8) return text;
  const normalized = `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
  return isIsoDate(normalized) ? normalized : text;
}
