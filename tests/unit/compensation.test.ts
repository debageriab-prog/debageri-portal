import { describe, expect, it } from "vitest";
import {
  compensationInput,
  defaultCompensationValues,
} from "@/domain/finance/compensation";

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
