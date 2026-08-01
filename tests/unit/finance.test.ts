import { describe, expect, it } from "vitest";
import {
  allocateInvoiceIncome,
  calculateShareMinor,
  calculateVatMinor,
  financeTotals,
  parseSek,
} from "@/domain/finance/calculations";
import {
  missingHeaders,
  parseFinanceCsv,
  transactionCsvHeaders,
} from "@/domain/finance/csv";

describe("finance calculations", () => {
  it("stores SEK in integer Ã¶re and accepts Swedish decimal commas", () => {
    expect(parseSek("1 234,56")).toBe(123_456);
    expect(() => parseSek("-1")).toThrow();
  });

  it("rounds VAT and consultant shares to the nearest Ã¶re", () => {
    expect(calculateVatMinor(100_01, 2_500)).toBe(2_500);
    expect(calculateShareMinor(100_01, 9_000)).toBe(9_001);
  });

  it("splits flexible invoice income while keeping fixed invoice income in the company", () => {
    expect(allocateInvoiceIncome(100_000, "flexible", 9_000)).toEqual({
      consultantMinor: 90_000,
      companyMinor: 10_000,
    });
    expect(allocateInvoiceIncome(100_000, "fixed", 0)).toEqual({
      consultantMinor: 0,
      companyMinor: 100_000,
    });
  });

  it("calculates revenue, cost, VAT, result, and balance deltas", () => {
    expect(
      financeTotals([
        {
          direction: "income",
          netMinor: 100_000,
          vatMinor: 25_000,
          consultantBalanceDeltaMinor: 90_000,
        },
        {
          direction: "expense",
          netMinor: 30_000,
          vatMinor: 0,
          consultantBalanceDeltaMinor: -30_000,
        },
      ]),
    ).toEqual({
      incomeMinor: 100_000,
      expenseMinor: 30_000,
      outputVatMinor: 25_000,
      inputVatMinor: 0,
      balanceMinor: 60_000,
      netResultMinor: 70_000,
    });
  });
});

describe("finance CSV", () => {
  it("parses quoted commas and escaped quotes", () => {
    const [row] = parseFinanceCsv('import_key,description\na1,"Laptop, 14"""');
    expect(row).toEqual({ import_key: "a1", description: 'Laptop, 14"' });
  });

  it("reports missing template headers", () => {
    const [row] = parseFinanceCsv("import_key,date\na1,2026-01-01");
    expect(missingHeaders(row!, transactionCsvHeaders)).toContain(
      "category_code",
    );
  });
});
