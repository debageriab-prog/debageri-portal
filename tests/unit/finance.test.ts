import { describe, expect, it } from "vitest";
import {
  allocateInvoiceIncome,
  belongsToCompany,
  calculateShareMinor,
  calculateTransactionAmounts,
  calculateVatMinor,
  companyBalanceDeltaMinor,
  expenseTotalsByCategory,
  financeTotals,
  parseSek,
  transactionTableDescription,
} from "@/domain/finance/calculations";
import {
  missingHeaders,
  parseFinanceCsv,
  transactionCsvHeaders,
} from "@/domain/finance/csv";
import { financeActionSchema } from "@/server/validators/finance";

describe("finance calculations", () => {
  it("stores SEK in integer Ã¶re and accepts Swedish decimal commas", () => {
    expect(parseSek("1 234,56")).toBe(123_456);
    expect(() => parseSek("-1")).toThrow();
  });

  it("rounds VAT and consultant shares to the nearest Ã¶re", () => {
    expect(calculateVatMinor(100_01, 2_500)).toBe(2_500);
    expect(calculateShareMinor(100_01, 9_000)).toBe(9_001);
  });

  it("derives exact totals from net or VAT-inclusive entry modes", () => {
    expect(calculateTransactionAmounts("net", 10_000_00, 2_500)).toEqual({
      netMinor: 10_000_00,
      vatMinor: 2_500_00,
      grossMinor: 12_500_00,
    });
    expect(calculateTransactionAmounts("gross", 12_500_00, 2_500)).toEqual({
      netMinor: 10_000_00,
      vatMinor: 2_500_00,
      grossMinor: 12_500_00,
    });
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

  it("counts company-funded consultant expenses in company scope only", () => {
    const transaction = {
      consultantId: "consultant-1",
      direction: "expense" as const,
      funding: "company" as const,
      netMinor: 40_000,
      consultantBalanceDeltaMinor: 0,
    };
    expect(belongsToCompany(transaction)).toBe(true);
    expect(companyBalanceDeltaMinor(transaction)).toBe(-40_000);
    expect(
      companyBalanceDeltaMinor({ ...transaction, netMinor: -40_000 }),
    ).toBe(40_000);
    expect(belongsToCompany({ ...transaction, funding: "consultant" })).toBe(
      false,
    );
  });

  it("uses the internal note only for company-only funded expenses", () => {
    const expense = {
      consultantId: null,
      direction: "expense" as const,
      funding: "company" as const,
      visibleDescription: "",
      internalNote: "Office rent",
    };
    expect(transactionTableDescription(expense)).toBe("Office rent");
    expect(
      transactionTableDescription({
        ...expense,
        consultantId: "consultant-1",
      }),
    ).toBe("");
    expect(
      transactionTableDescription({
        ...expense,
        visibleDescription: "Consultant-visible description",
      }),
    ).toBe("Consultant-visible description");
  });

  it("groups positive net expenses by category and omits zero totals", () => {
    expect(
      expenseTotalsByCategory([
        { categoryId: "insurance", direction: "expense", netMinor: 60_000 },
        { categoryId: "tax", direction: "expense", netMinor: 100_000 },
        { categoryId: "insurance", direction: "expense", netMinor: 40_000 },
        { categoryId: "tax", direction: "expense", netMinor: -100_000 },
        { categoryId: "sales", direction: "income", netMinor: 500_000 },
      ]),
    ).toEqual([{ categoryId: "insurance", amountMinor: 100_000 }]);
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

describe("finance deletion confirmation", () => {
  it("accepts editable transaction details in either amount mode", () => {
    expect(
      financeActionSchema.safeParse({
        action: "updateTransaction",
        transactionId: "transaction-1",
        direction: "expense",
        categoryId: "category-1",
        consultantId: "consultant-1",
        date: "2026-08-02",
        amountMode: "gross",
        amountMinor: 12_500_00,
        vatRateBps: 2_500,
        funding: "company",
        applyConsultantShare: false,
        visibleDescription: "Laptop",
        internalNote: "Corrected total",
      }).success,
    ).toBe(true);
  });

  it("requires the exact permanent-deletion phrase", () => {
    expect(
      financeActionSchema.safeParse({
        action: "deleteTransaction",
        transactionId: "transaction-1",
        confirmation: "I am sure",
      }).success,
    ).toBe(true);
    expect(
      financeActionSchema.safeParse({
        action: "deleteTransaction",
        transactionId: "transaction-1",
        confirmation: "yes",
      }).success,
    ).toBe(false);
  });
});
