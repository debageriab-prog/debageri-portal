import { describe, expect, it } from "vitest";
import {
  documentAccessMatchesRole,
  employmentDatesValid,
  financeAccessMatchesRole,
  financeAccessSchema,
  receivesDocuments,
} from "@/server/validators/user-access";

describe("employment end date", () => {
  it("rejects an end date before the start date", () => {
    expect(employmentDatesValid("2026-07-15", "2026-07-14")).toBe(false);
    expect(employmentDatesValid("2026-07-15", "2026-07-15")).toBe(true);
    expect(employmentDatesValid("2026-07-15", null)).toBe(true);
    expect(employmentDatesValid(null, "2026-07-15")).toBe(true);
  });

  it("keeps former employees available for documents", () => {
    expect(receivesDocuments({ status: "active" })).toBe(true);
    expect(
      receivesDocuments({ status: "active", employmentEndDate: "2026-07-15" }),
    ).toBe(true);
    expect(
      receivesDocuments({
        status: "inactive",
        employmentEndDate: "2026-07-15",
      }),
    ).toBe(true);
    expect(receivesDocuments({ status: "inactive" })).toBe(false);
  });
});

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
    expect(
      documentAccessMatchesRole("consultant", {
        contracts: true,
        payslips: true,
        receipts: false,
      }),
    ).toBe(true);
    expect(
      documentAccessMatchesRole("manager", {
        contracts: true,
        payslips: false,
        receipts: false,
      }),
    ).toBe(false);
    expect(
      documentAccessMatchesRole("accountant", {
        contracts: false,
        payslips: false,
        receipts: false,
      }),
    ).toBe(true);
  });

  it("allows pay slip access only on consultant and manager profiles", () => {
    expect(
      documentAccessMatchesRole("manager", {
        contracts: false,
        payslips: true,
        receipts: false,
      }),
    ).toBe(true);
    expect(
      documentAccessMatchesRole("accountant", {
        contracts: false,
        payslips: true,
        receipts: false,
      }),
    ).toBe(false);
    expect(
      documentAccessMatchesRole("admin", {
        contracts: false,
        payslips: true,
        receipts: false,
      }),
    ).toBe(false);
  });

  it("allows receipt access only on consultant and manager profiles", () => {
    const access = { contracts: false, payslips: false, receipts: true };
    expect(documentAccessMatchesRole("consultant", access)).toBe(true);
    expect(documentAccessMatchesRole("manager", access)).toBe(true);
    expect(documentAccessMatchesRole("accountant", access)).toBe(false);
  });
});
