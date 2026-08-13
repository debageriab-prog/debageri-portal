import { describe, expect, it } from "vitest";
import {
  documentAccessMatchesRole,
  financeAccessMatchesRole,
  financeAccessSchema,
} from "@/server/validators/user-access";

describe("finance access", () => {
  it("requires the parent finance permission for page permissions", () => {
    expect(
      financeAccessSchema.safeParse({
        enabled: false,
        myFinance: true,
        myInvoices: false,
      }).success,
    ).toBe(false);
  });

  it("allows independent consultant page permissions", () => {
    const access = {
      enabled: true,
      myFinance: false,
      myInvoices: true,
    };
    expect(financeAccessSchema.safeParse(access).success).toBe(true);
    expect(financeAccessMatchesRole("consultant", access)).toBe(true);
    expect(financeAccessMatchesRole("manager", access)).toBe(false);
  });

  it("requires at least one page when finance is enabled", () => {
    expect(
      financeAccessSchema.safeParse({
        enabled: true,
        myFinance: false,
        myInvoices: false,
      }).success,
    ).toBe(false);
  });
});

describe("document access", () => {
  it("allows contract access only on consultant profiles", () => {
    expect(documentAccessMatchesRole("consultant", { contracts: true })).toBe(
      true,
    );
    expect(documentAccessMatchesRole("manager", { contracts: true })).toBe(
      false,
    );
    expect(documentAccessMatchesRole("accountant", { contracts: false })).toBe(
      true,
    );
  });
});
