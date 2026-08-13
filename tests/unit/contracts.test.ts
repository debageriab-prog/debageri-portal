import { describe, expect, it } from "vitest";
import { contractFieldsSchema } from "@/server/validators/contracts";

describe("contract input", () => {
  const base = {
    name: "Consulting agreement",
    documentDate: "2026-08-13",
    validTo: null,
    confidential: true,
  };

  it("requires a consultant for consultant-owned contracts", () => {
    expect(
      contractFieldsSchema.safeParse({
        ...base,
        ownerType: "consultant",
        consultantId: null,
        visibleToConsultant: true,
      }).success,
    ).toBe(false);
  });

  it("does not allow company contracts to be consultant-visible", () => {
    expect(
      contractFieldsSchema.safeParse({
        ...base,
        ownerType: "company",
        consultantId: null,
        visibleToConsultant: true,
      }).success,
    ).toBe(false);
  });

  it("accepts a consultant-owned hidden contract", () => {
    expect(
      contractFieldsSchema.safeParse({
        ...base,
        ownerType: "consultant",
        consultantId: "user-1",
        visibleToConsultant: false,
      }).success,
    ).toBe(true);
  });
});
