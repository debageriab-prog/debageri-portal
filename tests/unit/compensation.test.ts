import { describe, expect, it } from "vitest";
import {
  COMPENSATION_END_CONFIRMATION,
  compensationInput,
  defaultCompensationValues,
  previousDay,
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
