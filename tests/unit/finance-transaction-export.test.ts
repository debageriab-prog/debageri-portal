import { describe, expect, it } from "vitest";
import { createFinanceCsv, parseFinanceCsv } from "@/domain/finance/csv";
import {
  balancesAfter,
  FingerprintPool,
  sekValue,
  transactionBackupCsvHeaders,
  transactionBackupRows,
  transactionExportTotals,
  transactionFingerprint,
  type ExportableTransaction,
} from "@/domain/finance/transaction-export";
import { transactionImportCsvHeaders } from "@/domain/finance/csv";

const base: ExportableTransaction = {
  id: "t1",
  direction: "income",
  categoryId: "cat-income",
  consultantId: "u1",
  date: "2026-03-01",
  netMinor: 100_000,
  vatRateBps: 2_500,
  vatMinor: 25_000,
  roundingMinor: 0,
  grossMinor: 125_000,
  funding: null,
  applyConsultantShare: true,
  shareBpsOverride: null,
  visibleDescription: "March, invoice 12",
  internalNote: "",
  createdAt: 1,
};

describe("sekValue", () => {
  it("writes öre as kronor with two decimals", () => {
    expect(sekValue(123_450)).toBe("1234.50");
    expect(sekValue(-5)).toBe("-0.05");
    expect(sekValue(0)).toBe("0.00");
  });
});

describe("transaction backup CSV", () => {
  it("keeps everything the import needs, including stored VAT and rounding", () => {
    const rows = transactionBackupRows(
      [{ ...base, roundingMinor: -20, grossMinor: 124_980 }],
      { employeeNumber: () => "1001", categoryCode: () => "3010" },
    );
    const parsed = parseFinanceCsv(
      createFinanceCsv(transactionBackupCsvHeaders, rows),
    );
    expect(parsed[0]).toMatchObject({
      direction: "income",
      import_key: "t1",
      consultant_employee_number: "1001",
      category_code: "3010",
      net_sek: "1000.00",
      vat_percent: "25.00",
      vat_sek: "250.00",
      rounding_sek: "-0.20",
      gross_sek: "1249.80",
      apply_share: "true",
      description: "March, invoice 12",
    });
    for (const header of transactionImportCsvHeaders)
      expect(parsed[0]).toHaveProperty(header);
  });
});

describe("balancesAfter", () => {
  it("adds up changes oldest first, by date and then by when recorded", () => {
    const balances = balancesAfter(
      [
        { id: "c", date: "2026-02-01", createdAt: 1, change: -300 },
        { id: "b", date: "2026-01-15", createdAt: 9, change: 200 },
        { id: "a", date: "2026-01-15", createdAt: 2, change: 1_000 },
      ],
      (item) => item.change,
    );
    expect(balances.get("a")).toBe(1_000);
    expect(balances.get("b")).toBe(1_200);
    expect(balances.get("c")).toBe(900);
  });
});

describe("transactionExportTotals", () => {
  it("sums income and expenses separately with their VAT", () => {
    const totals = transactionExportTotals(
      [
        base,
        {
          ...base,
          id: "t2",
          direction: "expense",
          netMinor: 40_000,
          vatMinor: 10_000,
          grossMinor: 50_000,
          funding: "consultant",
        },
      ],
      (item) => (item.direction === "income" ? 60_000 : -40_000),
    );
    expect(totals).toMatchObject({
      count: 2,
      incomeNetMinor: 100_000,
      incomeVatMinor: 25_000,
      expenseNetMinor: 40_000,
      expenseVatMinor: 10_000,
      resultNetMinor: 60_000,
      vatNetMinor: 15_000,
      balanceChangeMinor: 20_000,
    });
  });
});

describe("FingerprintPool", () => {
  it("skips one file row per matching payment already in the portal", () => {
    const fingerprint = transactionFingerprint(base);
    const pool = new FingerprintPool([fingerprint]);
    expect(pool.take(fingerprint)).toBe(true);
    expect(pool.take(fingerprint)).toBe(false);
    expect(pool.take(transactionFingerprint({ ...base, netMinor: 1 }))).toBe(
      false,
    );
  });

  it("ignores surrounding spaces in the description", () => {
    expect(
      transactionFingerprint({
        ...base,
        visibleDescription: " March, invoice 12 ",
      }),
    ).toBe(transactionFingerprint(base));
  });
});

describe("transactionListPdf", () => {
  it("spreads long lists over pages with the headings repeated", async () => {
    const { transactionListPdf } =
      await import("@/server/export/transaction-list-pdf");
    const pdf = transactionListPdf({
      title: "Income and expenses",
      details: ["Period: 2026-03"],
      totals: [{ label: "Total income", value: "1 000 kr" }],
      columns: [
        { label: "Date", align: "left", width: 1 },
        { label: "Net amount", align: "right", width: 1 },
      ],
      rows: Array.from({ length: 80 }, (_, index) => [
        "2026-03-01",
        String(index),
      ]),
      pageLabel: "Page {page} of {pages}",
      emptyLabel: "None",
    }).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toMatch(/\/Count [2-9]/);
  });
});
