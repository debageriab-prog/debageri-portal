export type CsvRow = Record<string, string>;

function splitRecords(source: string) {
  const records: string[] = [];
  let record = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"') {
      record += character;
      if (quoted && source[index + 1] === '"') {
        record += source[index + 1];
        index += 1;
      } else quoted = !quoted;
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (record.trim()) records.push(record);
      record = "";
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else record += character;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (record.trim()) records.push(record);
  return records;
}

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
  const lines = splitRecords(source.replace(/^\uFEFF/, ""));
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

export const transactionExportCsvHeaders = [
  "direction",
  ...transactionCsvHeaders,
] as const;

export function missingHeaders(row: CsvRow, required: readonly string[]) {
  return required.filter((header) => !(header in row));
}

function escapeCsvValue(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function createFinanceCsv(headers: readonly string[], rows: CsvRow[]) {
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","),
    ),
  ].join("\r\n");
}
