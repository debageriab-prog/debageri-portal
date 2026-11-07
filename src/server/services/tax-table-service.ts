import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  parseMunicipalities,
  parseTaxTables,
  type Municipality,
  type TaxTable,
  type TaxYearSummary,
} from "@/domain/salary/tax";
import type { PortalUser } from "@/domain/types";

/** Skatteverket's open data (EntryScape rowstore), monthly tables and rates. */
const SKATTEVERKET_ROWSTORE =
  "https://skatteverket.entryscape.net/rowstore/dataset";
const TAX_TABLE_DATASET = "88320397-5c32-4c16-ae79-d36d95b17b95";
const TAX_RATE_DATASET = "c67b320b-ffee-4876-b073-dd9236cd2a99";
const PAGE_SIZE = 500;
const MAX_PAGES = 60;

export class TaxTableError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchRows(
  fetcher: Fetcher,
  dataset: string,
  year: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${SKATTEVERKET_ROWSTORE}/${dataset}`);
    url.searchParams.set("år", String(year));
    url.searchParams.set("_limit", String(PAGE_SIZE));
    url.searchParams.set("_offset", String(page * PAGE_SIZE));
    const response = await fetcher(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new TaxTableError("taxTablesUnavailable", 502);
    const body = (await response.json()) as {
      resultCount?: number;
      results?: Record<string, unknown>[];
    };
    const results = Array.isArray(body.results) ? body.results : [];
    rows.push(...results);
    if (results.length < PAGE_SIZE || rows.length >= (body.resultCount ?? 0))
      return rows;
  }
  throw new TaxTableError("taxTablesUnavailable", 502);
}

function municipalRatesId(organizationId: string, year: number) {
  return `${organizationId}_${year}`;
}

function taxTableId(organizationId: string, year: number, table: number) {
  return `${organizationId}_${year}_${table}`;
}

/**
 * Downloads one year's monthly tax tables and municipal tax rates from
 * Skatteverket and replaces what the organization has stored for that year.
 */
export async function importTaxTables(
  db: Firestore,
  actor: PortalUser,
  year: number,
  fetcher: Fetcher = fetch,
) {
  if (actor.role !== "admin") throw new TaxTableError("forbidden", 403);
  let tables: TaxTable[];
  let municipalities: Municipality[];
  try {
    const [tableRows, rateRows] = await Promise.all([
      fetchRows(fetcher, TAX_TABLE_DATASET, year),
      fetchRows(fetcher, TAX_RATE_DATASET, year),
    ]);
    tables = parseTaxTables(tableRows, year);
    municipalities = parseMunicipalities(rateRows, year);
  } catch (error) {
    if (error instanceof TaxTableError) throw error;
    throw new TaxTableError("taxTablesUnavailable", 502);
  }
  if (!tables.length || !municipalities.length)
    throw new TaxTableError("taxTablesNotPublished", 404);

  const batch = db.batch();
  const existing = await db
    .collection("taxTables")
    .where("organizationId", "==", actor.organizationId)
    .where("year", "==", year)
    .get();
  const kept = new Set(
    tables.map((table) => taxTableId(actor.organizationId, year, table.table)),
  );
  for (const document of existing.docs)
    if (!kept.has(document.id)) batch.delete(document.ref);
  for (const table of tables)
    batch.set(
      db
        .collection("taxTables")
        .doc(taxTableId(actor.organizationId, year, table.table)),
      {
        organizationId: actor.organizationId,
        year,
        table: table.table,
        rows: table.rows,
        importedAt: FieldValue.serverTimestamp(),
        importedBy: actor.id,
      },
    );
  batch.set(
    db
      .collection("municipalTaxRates")
      .doc(municipalRatesId(actor.organizationId, year)),
    {
      organizationId: actor.organizationId,
      year,
      municipalities,
      importedAt: FieldValue.serverTimestamp(),
      importedBy: actor.id,
    },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "taxTables.imported",
    entityType: "taxTables",
    entityId: String(year),
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      year,
      tables: tables.map((table) => table.table),
      municipalities: municipalities.length,
    },
  });
  await batch.commit();
  return { tables: tables.length, municipalities: municipalities.length };
}

/** The years imported for the organization, newest first. */
export async function taxYears(
  db: Firestore,
  organizationId: string,
): Promise<TaxYearSummary[]> {
  const [rates, tables] = await Promise.all([
    db
      .collection("municipalTaxRates")
      .where("organizationId", "==", organizationId)
      .select("year", "municipalities", "importedAt")
      .get(),
    db
      .collection("taxTables")
      .where("organizationId", "==", organizationId)
      .select("year", "table")
      .get(),
  ]);
  return rates.docs
    .map((document) => {
      const data = document.data();
      const year = Number(data.year);
      return {
        year,
        tables: tables.docs
          .filter((table) => Number(table.data().year) === year)
          .map((table) => Number(table.data().table))
          .sort((left, right) => left - right),
        municipalities: Array.isArray(data.municipalities)
          ? data.municipalities.length
          : 0,
        importedAt: data.importedAt?.toMillis?.() ?? null,
      };
    })
    .sort((left, right) => right.year - left.year);
}

/** A year's municipalities, or the newest imported year's when it is missing. */
export async function municipalitiesFor(
  db: Firestore,
  organizationId: string,
  year: number,
): Promise<{ year: number; municipalities: Municipality[] } | null> {
  const exact = await db
    .collection("municipalTaxRates")
    .doc(municipalRatesId(organizationId, year))
    .get();
  if (exact.exists)
    return { year, municipalities: exact.data()?.municipalities ?? [] };
  const years = await taxYears(db, organizationId);
  const latest = years[0];
  if (!latest) return null;
  const fallback = await db
    .collection("municipalTaxRates")
    .doc(municipalRatesId(organizationId, latest.year))
    .get();
  return {
    year: latest.year,
    municipalities: fallback.data()?.municipalities ?? [],
  };
}

/** One stored table, or null when that year or table is not imported. */
export async function loadTaxTable(
  db: Firestore,
  organizationId: string,
  year: number,
  table: number,
): Promise<TaxTable | null> {
  const snapshot = await db
    .collection("taxTables")
    .doc(taxTableId(organizationId, year, table))
    .get();
  if (!snapshot.exists) return null;
  return { year, table, rows: snapshot.data()?.rows ?? [] };
}
