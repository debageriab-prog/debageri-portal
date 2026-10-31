import { describe, expect, it } from "vitest";
import {
  allocateInvoiceIncome,
  earnsInvoiceShare,
} from "@/domain/finance/calculations";
import {
  COMPENSATION_END_CONFIRMATION,
  compensationInput,
  defaultCompensationValues,
  monthlyCompensation,
  previousDay,
  type CompensationRecord,
} from "@/domain/finance/compensation";
import { compensationSchema } from "@/server/validators/finance";

describe("compensation end confirmation", () => {
  const input = {
    action: "setCompensation",
    userId: "user-1",
    model: "flexible",
    validFrom: "2026-11-01",
    shareBps: 9000,
    fixedMonthlySalaryMinor: null,
  };

  it("accepts only the exact phrase", () => {
    expect(
      compensationSchema.safeParse({
        ...input,
        confirmation: COMPENSATION_END_CONFIRMATION,
      }).success,
    ).toBe(true);
    expect(
      compensationSchema.safeParse({ ...input, confirmation: "i am sure" })
        .success,
    ).toBe(false);
  });

  it("is optional when no period is open-ended", () => {
    expect(compensationSchema.safeParse(input).success).toBe(true);
  });

  it("ends the current period the day before the new one", () => {
    expect(previousDay("2026-11-01")).toBe("2026-10-31");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
});

describe("hybrid compensation", () => {
  const consultantId = "user-1";
  const hybrid: CompensationRecord = {
    id: "hybrid",
    userId: consultantId,
    model: "hybrid",
    validFrom: "2026-01-15",
    validTo: null,
    shareBps: 1000,
    fixedMonthlySalaryMinor: 3_000_000,
  };
  const income = (date: string, consultantBalanceDeltaMinor: number) => ({
    consultantId,
    direction: "income" as const,
    date,
    consultantBalanceDeltaMinor,
  });

  it("sends both the share and the salary", () => {
    expect(
      compensationInput({
        ...defaultCompensationValues("2026-01-01"),
        model: "hybrid",
        sharePercent: "10",
        fixedSalary: "30000",
      }),
    ).toMatchObject({ shareBps: 1000, fixedMonthlySalaryMinor: 3_000_000 });
  });

  it("credits the share only on a paid invoice and keeps the rest", () => {
    const allocation = allocateInvoiceIncome(20_000_000, "hybrid", 1000);
    expect(allocation).toEqual({
      consultantMinor: 2_000_000,
      companyMinor: 18_000_000,
    });
  });

  it("pays the salary alone without invoices and adds the share with them", () => {
    const rows = monthlyCompensation(
      [hybrid],
      [income("2026-02-10", 2_000_000)],
      consultantId,
      "2026-02-28",
    );
    expect(rows).toEqual([
      {
        month: "2026-02",
        fixedMinor: 3_000_000,
        shareMinor: 2_000_000,
        totalMinor: 5_000_000,
      },
      {
        month: "2026-01",
        fixedMinor: 3_000_000,
        shareMinor: 0,
        totalMinor: 3_000_000,
      },
    ]);
  });

  it("nets a reversal and ignores other people and expenses", () => {
    const [row] = monthlyCompensation(
      [hybrid],
      [
        income("2026-01-20", 2_000_000),
        income("2026-01-25", -2_000_000),
        { ...income("2026-01-20", 500_000), consultantId: "user-2" },
        { ...income("2026-01-20", -700_000), direction: "expense" },
      ],
      consultantId,
      "2026-01-31",
    );
    expect(row).toMatchObject({ shareMinor: 0, totalMinor: 3_000_000 });
  });

  it("covers only the months under a hybrid period", () => {
    const rows = monthlyCompensation(
      [
        {
          ...hybrid,
          id: "flexible",
          model: "flexible",
          validFrom: "2025-11-01",
          validTo: "2025-12-31",
          fixedMonthlySalaryMinor: null,
        },
        { ...hybrid, validFrom: "2026-01-01", validTo: "2026-01-31" },
        {
          ...hybrid,
          id: "fixed",
          model: "fixed",
          validFrom: "2026-02-01",
          shareBps: 0,
        },
      ],
      [],
      consultantId,
      "2026-03-31",
    );
    expect(rows.map((row) => row.month)).toEqual(["2026-01"]);
  });

  it("returns nothing for consultants without a hybrid period", () => {
    expect(
      monthlyCompensation(
        [{ ...hybrid, model: "flexible" }],
        [],
        consultantId,
        "2026-03-31",
      ),
    ).toEqual([]);
  });

  it("counts as earning a share only for models with one", () => {
    expect(earnsInvoiceShare("hybrid")).toBe(true);
    expect(earnsInvoiceShare("flexible")).toBe(true);
    expect(earnsInvoiceShare("fixed")).toBe(false);
    expect(earnsInvoiceShare(null)).toBe(false);
  });
});

describe("compensation input", () => {
  const defaults = defaultCompensationValues("2026-11-01");

  it("sends a flexible share in basis points without a salary", () => {
    expect(
      compensationInput({
        ...defaults,
        sharePercent: "87.5",
        fixedSalary: "45000",
      }),
    ).toEqual({
      model: "flexible",
      validFrom: "2026-11-01",
      validTo: null,
      shareBps: 8750,
      fixedMonthlySalaryMinor: null,
    });
  });

  it("sends a fixed salary in öre without a share", () => {
    expect(
      compensationInput({
        ...defaults,
        model: "fixed",
        validTo: "2027-10-31",
        fixedSalary: "45000.50",
      }),
    ).toEqual({
      model: "fixed",
      validFrom: "2026-11-01",
      validTo: "2027-10-31",
      shareBps: 0,
      fixedMonthlySalaryMinor: 4_500_050,
    });
  });
});
