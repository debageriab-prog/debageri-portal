export type CsvRow = Record<string, string>;

function parseLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  values.push(value.trim());
  return values;
}

export function parseFinanceCsv(source: string): CsvRow[] {
  const lines = source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2)
    throw new Error("CSV must contain a header and at least one row");
  const headers = parseLine(lines[0]!).map((header) => header.toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique");
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    if (values.length !== headers.length)
      throw new Error("CSV row has the wrong number of fields");
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

export const invoiceCsvHeaders = [
  "import_key",
  "invoice_number",
  "consultant_employee_number",
  "customer",
  "issue_date",
  "due_date",
  "paid_date",
  "net_sek",
  "vat_percent",
  "income_category_code",
  "share_percent",
  "description",
  "internal_note",
] as const;

export const transactionCsvHeaders = [
  "import_key",
  "consultant_employee_number",
  "date",
  "category_code",
  "net_sek",
  "vat_percent",
  "funding",
  "apply_share",
  "description",
  "internal_note",
] as const;

export function missingHeaders(row: CsvRow, required: readonly string[]) {
  return required.filter((header) => !(header in row));
}
