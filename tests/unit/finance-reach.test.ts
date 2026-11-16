import { describe, expect, it } from "vitest";
import { FULL_REACH, type Reach } from "@/domain/access/groups";
import {
  ARTICLE_FOR_ALL,
  ARTICLE_FOR_COMPANY,
} from "@/domain/finance/invoice-articles";
import {
  articleScopeEditableBy,
  articleVisibleTo,
  reachesTransaction,
  transactionOwnerId,
} from "@/domain/finance/reach";

const itOnly: Reach = { all: false, company: false, userIds: new Set(["it"]) };
const itAndCompany: Reach = {
  all: false,
  company: true,
  userIds: new Set(["it"]),
};

describe("finance reach", () => {
  it("finds who a transaction belongs to", () => {
    expect(transactionOwnerId({ consultantId: "a" })).toBe("a");
    expect(
      transactionOwnerId({ consultantId: null, invoiceConsultantId: "b" }),
    ).toBe("b");
    expect(transactionOwnerId({ consultantId: null, employeeId: "c" })).toBe(
      "c",
    );
    expect(transactionOwnerId({ consultantId: null })).toBeNull();
  });

  it("reaches transactions of reached people and company ones with the company group", () => {
    expect(reachesTransaction(itOnly, { consultantId: "it" })).toBe(true);
    expect(reachesTransaction(itOnly, { consultantId: "finance" })).toBe(false);
    // The company share of a reached consultant's invoice.
    expect(
      reachesTransaction(itOnly, {
        consultantId: null,
        invoiceConsultantId: "it",
      }),
    ).toBe(true);
    // A salary expense of an employee outside the reach is not company data.
    expect(
      reachesTransaction(itAndCompany, {
        consultantId: null,
        employeeId: "finance",
      }),
    ).toBe(false);
    expect(reachesTransaction(itOnly, { consultantId: null })).toBe(false);
    expect(reachesTransaction(itAndCompany, { consultantId: null })).toBe(true);
    expect(reachesTransaction(FULL_REACH, { consultantId: "finance" })).toBe(
      true,
    );
  });

  it("shows shared articles to everyone but only lets the company group change them", () => {
    expect(articleVisibleTo(itOnly, ARTICLE_FOR_ALL)).toBe(true);
    expect(articleScopeEditableBy(itOnly, ARTICLE_FOR_ALL)).toBe(false);
    expect(articleScopeEditableBy(itAndCompany, ARTICLE_FOR_ALL)).toBe(true);
    expect(articleVisibleTo(itOnly, ARTICLE_FOR_COMPANY)).toBe(false);
    expect(articleVisibleTo(itAndCompany, ARTICLE_FOR_COMPANY)).toBe(true);
    expect(articleVisibleTo(itOnly, "it")).toBe(true);
    expect(articleScopeEditableBy(itOnly, "finance")).toBe(false);
    expect(articleScopeEditableBy(FULL_REACH, ARTICLE_FOR_ALL)).toBe(true);
  });
});
