/**
 * Preliminary tax (prel skatt) on monthly pay from Skatteverket's tax tables,
 * and the municipal tax rates that decide which table applies.
 *
 * Rates are integer thousandths of a percent, so 32.042 % is 32042. Table
 * incomes are whole kronor; amounts here are öre.
 */

export const TAX_COLUMNS = [1, 2, 3, 4, 5, 6] as const;
export type TaxColumn = (typeof TAX_COLUMNS)[number];

/** One income bracket of a monthly tax table. */
export interface TaxTableRow {
  /** Whole kronor, inclusive. */
  from: number;
  /** Whole kronor, inclusive; null for the open-ended top bracket. */
  to: number | null;
  /** `amount` rows give kronor of tax, `percent` rows a percent of income. */
  kind: "amount" | "percent";
  /** One value per column 1–6. */
  values: number[];
}

export interface TaxTable {
  year: number;
  table: number;
  rows: TaxTableRow[];
}

export interface Parish {
  name: string;
  /** Total rate including the church fee. */
  rateWithChurch: number;
}

export interface Municipality {
  /** Four digits, for example `0114`. */
  code: string;
  name: string;
  /** Municipal and regional tax plus burial fee, without the church fee. */
  rate: number;
  parishes: Parish[];
}

/** What is imported for one tax year. */
export interface TaxYearSummary {
  year: number;
  tables: number[];
  municipalities: number;
  importedAt: number | null;
}

/** Jämkning: a decision from Skatteverket that replaces the table tax. */
export type TaxAdjustment =
  | { type: "none" }
  | { type: "percent"; bps: number }
  | { type: "amount"; minor: number };

/**
 * The table for a total tax rate. Tables are whole percents: a rate is
 * rounded to the nearest one, and exactly half rounds down.
 */
export function suggestTaxTable(rate: number) {
  return Math.ceil((rate - 500) / 1000);
}

/** The rate that decides the table, with the church fee for members. */
export function taxRateFor(
  municipality: Municipality,
  churchMember: boolean,
  parishName?: string | null,
) {
  if (!churchMember) return municipality.rate;
  const parish =
    municipality.parishes.find((item) => item.name === parishName) ??
    (municipality.parishes.length === 1 ? municipality.parishes[0] : null);
  return parish?.rateWithChurch ?? null;
}

/** Table tax in öre on a month's taxable pay. */
export function lookupTaxMinor(
  table: Pick<TaxTable, "rows">,
  column: TaxColumn,
  taxableMinor: number,
) {
  if (taxableMinor <= 0) return 0;
  const kronor = Math.floor(taxableMinor / 100);
  const row = table.rows.find(
    (item) => item.from <= kronor && (item.to === null || kronor <= item.to),
  );
  if (!row) throw new Error("No tax table bracket covers this income");
  const value = row.values[column - 1] ?? 0;
  return row.kind === "amount"
    ? value * 100
    : // Percent rows are rounded down to whole kronor.
      Math.floor((kronor * value) / 100) * 100;
}

/** Tax in öre after any jämkning decision. */
export function taxMinor(
  table: Pick<TaxTable, "rows"> | null,
  column: TaxColumn,
  taxableMinor: number,
  adjustment: TaxAdjustment,
) {
  if (adjustment.type === "amount") return adjustment.minor;
  if (adjustment.type === "percent")
    // Withheld tax is whole kronor.
    return Math.round((taxableMinor * adjustment.bps) / 10_000 / 100) * 100;
  if (!table) throw new Error("A tax table is needed");
  return lookupTaxMinor(table, column, taxableMinor);
}

function integer(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}

/** Thousandths of a percent from Skatteverket's decimal text, e.g. `32.042`. */
function rate(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(text)) return null;
  const [whole, decimals = ""] = text.split(".");
  return Number(whole) * 1000 + Number(decimals.padEnd(3, "0"));
}

/**
 * Monthly tables (`30B` amount rows and `30%` percent rows) from rows of
 * Skatteverket's "Skattetabeller för månadslön" open data.
 */
export function parseTaxTables(
  rows: ReadonlyArray<Record<string, unknown>>,
  year: number,
): TaxTable[] {
  const tables = new Map<number, TaxTableRow[]>();
  for (const row of rows) {
    if (integer(row["år"]) !== year) continue;
    const period = String(row["antal dgr"] ?? "").trim();
    if (period !== "30B" && period !== "30%") continue;
    const table = integer(row.tabellnr);
    const from = integer(row["inkomst fr.o.m."]);
    const toText = String(row["inkomst t.o.m."] ?? "").trim();
    const to = toText === "" ? null : integer(toText);
    const values = TAX_COLUMNS.map((column) =>
      integer(row[`kolumn ${column}`]),
    );
    if (
      table === null ||
      from === null ||
      (toText !== "" && to === null) ||
      values.some((value) => value === null)
    )
      throw new Error("Unexpected tax table row");
    const list = tables.get(table) ?? [];
    list.push({
      from,
      to,
      kind: period === "30B" ? "amount" : "percent",
      values: values as number[],
    });
    tables.set(table, list);
  }
  return [...tables]
    .map(([table, list]) => ({
      year,
      table,
      rows: list.sort((left, right) => left.from - right.from),
    }))
    .sort((left, right) => left.table - right.table);
}

/** Municipalities from rows of Skatteverket's "Skattesatser" open data. */
export function parseMunicipalities(
  rows: ReadonlyArray<Record<string, unknown>>,
  year: number,
): Municipality[] {
  const municipalities = new Map<string, Municipality>();
  for (const row of rows) {
    if (integer(row["år"]) !== year) continue;
    const code = String(row["församlings-kod"] ?? "").replace(/\s/g, "");
    const name = String(row.kommun ?? "").trim();
    const parish = String(row["församling"] ?? "").trim();
    const without = rate(row["summa, exkl. kyrkoavgift"]);
    const withChurch = rate(row["summa, inkl. kyrkoavgift"]);
    if (
      !/^\d{4}/.test(code) ||
      !name ||
      without === null ||
      withChurch === null
    )
      throw new Error("Unexpected tax rate row");
    const key = code.slice(0, 4);
    const entry = municipalities.get(key) ?? {
      code: key,
      name,
      rate: without,
      parishes: [],
    };
    if (parish)
      entry.parishes.push({ name: parish, rateWithChurch: withChurch });
    municipalities.set(key, entry);
  }
  return [...municipalities.values()]
    .map((entry) => ({
      ...entry,
      parishes: entry.parishes.sort((left, right) =>
        left.name.localeCompare(right.name, "sv"),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "sv"));
}

/** A rate as a percent for display, e.g. `32.042`. */
export function formatTaxRate(value: number) {
  return (value / 1000).toFixed(3);
}
