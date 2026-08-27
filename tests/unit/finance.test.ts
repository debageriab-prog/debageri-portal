import { describe, expect, it } from "vitest";
import {
  allocateInvoiceIncome,
  belongsToCompany,
  belongsToConsultant,
  belongsToFixedConsultantResult,
  calculateShareMinor,
  calculateTransactionAmounts,
  calculateVatMinor,
  companyBalanceDeltaMinor,
  companyOutstandingInvoiceShareMinor,
  expenseTotalsByCategory,
  financeTotals,
  flexibleConsultantBalanceHistory,
  flexibleConsultantRetainedResultHistory,
  isSalaryRelatedExpenseCode,
  paidFlexibleCompanyResultMinor,
  parseSek,
  transactionTableDescription,
  vatPayableMinor,
} from "@/domain/finance/calculations";
import {
  missingHeaders,
  parseFinanceCsv,
  transactionCsvHeaders,
} from "@/domain/finance/csv";
import { financeActionSchema } from "@/server/validators/finance";

describe("finance calculations", () => {
  it("builds flexible consultant balance and retained-result histories", () => {
    const invoices = [
      {
        id: "paid",
        invoiceNumber: "INV-1",
        customerName: "Customer A",
        consultantId: "consultant-1",
        compensationModel: "flexible" as const,
        status: "paid" as const,
        paidDate: "2026-01-10",
        netMinor: 100_000,
        shareBps: 7_000,
      },
      {
        id: "issued",
        invoiceNumber: "INV-2",
        customerName: "Customer B",
        consultantId: "consultant-1",
        compensationModel: "flexible" as const,
        status: "issued" as const,
        paidDate: null,
        netMinor: 200_000,
        shareBps: 7_000,
      },
    ];
    const transactions = [
      {
        id: "consultant-expense",
        consultantId: "consultant-1",
        direction: "expense" as const,
        funding: "consultant" as const,
        date: "2026-01-15",
        netMinor: 20_000,
        categoryId: "travel",
        visibleDescription: "Train",
        internalNote: "",
      },
      {
        id: "company-expense",
        consultantId: "consultant-1",
        direction: "expense" as const,
        funding: "company" as const,
        date: "2026-01-20",
        netMinor: 8_000,
        categoryId: "software",
        visibleDescription: "",
        internalNote: "License",
      },
    ];

    const balance = flexibleConsultantBalanceHistory(
      invoices,
      transactions,
      "consultant-1",
    );
    const retained = flexibleConsultantRetainedResultHistory(
      invoices,
      transactions,
      "consultant-1",
    );

    expect(balance.map((entry) => entry.changeMinor)).toEqual([
      70_000, -20_000,
    ]);
    expect(balance.at(-1)?.runningTotalMinor).toBe(50_000);
    expect(retained.map((entry) => entry.changeMinor)).toEqual([
      30_000, -8_000,
    ]);
    expect(retained.at(-1)?.runningTotalMinor).toBe(22_000);
  });

  it("reduces VAT payable only by active settlements", () => {
    expect(
      vatPayableMinor(
        [
          { direction: "income", vatMinor: 25_000 },
          { direction: "expense", vatMinor: 5_000 },
        ],
        [
          { amountMinor: 12_000, status: "active" },
          { amountMinor: 3_000, status: "reversed" },
        ],
      ),
    ).toBe(8_000);
  });

  it("validates VAT settlement periods and reversal reasons", () => {
    expect(
      financeActionSchema.safeParse({
        action: "createVatSettlement",
        paymentDate: "2026-08-04",
        periodFrom: "2026-04-01",
        periodTo: "2026-06-30",
        amountMinor: 10_000,
        reference: "VAT Q2",
        note: "",
      }).success,
    ).toBe(true);
    expect(
      financeActionSchema.safeParse({
        action: "createVatSettlement",
        paymentDate: "2026-08-04",
        periodFrom: "2026-06-30",
        periodTo: "2026-04-01",
        amountMinor: 10_000,
      }).success,
    ).toBe(false);
    expect(
      financeActionSchema.safeParse({
        action: "updateVatSettlement",
        settlementId: "settlement-1",
        paymentDate: "2026-08-04",
        periodFrom: "2026-04-01",
        periodTo: "2026-06-30",
        amountMinor: 10_000,
      }).success,
    ).toBe(true);
    expect(
      financeActionSchema.safeParse({
        action: "reverseVatSettlement",
        settlementId: "settlement-1",
        reason: "Incorrect amount",
      }).success,
    ).toBe(true);
  });

  it("identifies salary-related expense category codes", () => {
    expect(isSalaryRelatedExpenseCode("salary")).toBe(true);
    expect(isSalaryRelatedExpenseCode("SALARY_TAX")).toBe(true);
    expect(isSalaryRelatedExpenseCode("employer_tax")).toBe(true);
    expect(isSalaryRelatedExpenseCode("travel")).toBe(false);
  });

  it("calculates the company net share of outstanding invoices", () => {
    expect(
      companyOutstandingInvoiceShareMinor({
        netMinor: 100_000,
        shareBps: 9_000,
      }),
    ).toBe(10_000);
    expect(
      companyOutstandingInvoiceShareMinor({
        netMinor: 100_000,
        shareBps: 0,
      }),
    ).toBe(100_000);
  });

  it("calculates a flexible consultant company result from paid invoices only", () => {
    expect(
      paidFlexibleCompanyResultMinor(
        [
          {
            consultantId: "consultant-1",
            compensationModel: "flexible",
            status: "paid",
            netMinor: 100_000,
            shareBps: 7_000,
          },
          {
            consultantId: "consultant-1",
            compensationModel: "flexible",
            status: "issued",
            netMinor: 200_000,
            shareBps: 7_000,
          },
          {
            consultantId: "consultant-2",
            compensationModel: "flexible",
            status: "paid",
            netMinor: 300_000,
            shareBps: 7_000,
          },
          {
            consultantId: "consultant-1",
            compensationModel: "fixed",
            status: "paid",
            netMinor: 400_000,
            shareBps: 0,
          },
        ],
        "consultant-1",
      ),
    ).toBe(30_000);
  });
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
    expect(belongsToConsultant(transaction, "consultant-1")).toBe(false);
    expect(belongsToConsultant(transaction, "consultant-1", "all")).toBe(true);
    expect(belongsToConsultant(transaction, "consultant-1", "company")).toBe(
      true,
    );
    expect(belongsToConsultant(transaction, "consultant-1", "consultant")).toBe(
      false,
    );
    expect(
      belongsToConsultant(
        { ...transaction, funding: "consultant" },
        "consultant-1",
      ),
    ).toBe(true);
    expect(
      belongsToConsultant(
        { ...transaction, funding: "consultant" },
        "consultant-1",
        "company",
      ),
    ).toBe(false);
    expect(
      belongsToConsultant(
        { ...transaction, funding: "consultant" },
        "consultant-1",
        "all",
      ),
    ).toBe(true);
    expect(
      belongsToConsultant(
        { ...transaction, direction: "income", funding: null },
        "consultant-1",
      ),
    ).toBe(true);
    expect(belongsToConsultant(transaction, "consultant-2")).toBe(false);
  });

  it("attributes company invoice income to a fixed consultant result", () => {
    const companyInvoiceIncome = {
      consultantId: null,
      direction: "income" as const,
      funding: null,
      invoiceId: "invoice-1",
    };
    expect(
      belongsToFixedConsultantResult(
        companyInvoiceIncome,
        "consultant-1",
        "consultant-1",
      ),
    ).toBe(true);
    expect(
      belongsToFixedConsultantResult(
        companyInvoiceIncome,
        "consultant-1",
        "consultant-2",
      ),
    ).toBe(false);
    expect(
      belongsToFixedConsultantResult(
        {
          consultantId: "consultant-1",
          direction: "expense",
          funding: "consultant",
          invoiceId: null,
        },
        "consultant-1",
        null,
      ),
    ).toBe(true);
    expect(
      belongsToFixedConsultantResult(
        {
          consultantId: "consultant-1",
          direction: "expense",
          funding: "company",
          invoiceId: null,
        },
        "consultant-1",
        null,
      ),
    ).toBe(false);
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

  it("uses an invoice income internal note when its description is empty", () => {
    expect(
      transactionTableDescription({
        consultantId: null,
        direction: "income",
        funding: null,
        visibleDescription: "",
        internalNote: "Invoice note",
      }),
    ).toBe("Invoice note");
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
