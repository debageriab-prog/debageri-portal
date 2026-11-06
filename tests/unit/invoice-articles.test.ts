import { describe, expect, it } from "vitest";
import {
  ARTICLE_FOR_ALL,
  ARTICLE_FOR_COMPANY,
  articleAppliesTo,
  articlesForInvoice,
  articleStatus,
  articleValidOn,
  validityOverlaps,
  type InvoiceArticle,
} from "@/domain/finance/invoice-articles";

const article = (
  id: string,
  consultantScope: string,
  validFrom = "2026-01-01",
  validTo: string | null = null,
  articleNumber = id,
): InvoiceArticle => ({
  id,
  articleNumber,
  description: `Article ${id}`,
  unit: "h",
  unitPriceMinor: 850_00,
  consultantScope,
  vatRateBps: 2500,
  validFrom,
  validTo,
});

describe("invoice articles", () => {
  it("is valid from its first day through its last, or open-ended", () => {
    const closed = article("1", ARTICLE_FOR_ALL, "2026-01-01", "2026-06-30");
    expect(articleValidOn(closed, "2025-12-31")).toBe(false);
    expect(articleValidOn(closed, "2026-01-01")).toBe(true);
    expect(articleValidOn(closed, "2026-06-30")).toBe(true);
    expect(articleValidOn(closed, "2026-07-01")).toBe(false);
    expect(articleValidOn(article("2", ARTICLE_FOR_ALL), "2030-01-01")).toBe(
      true,
    );
  });

  it("applies to all, company-only or one consultant's invoices", () => {
    expect(articleAppliesTo(article("1", ARTICLE_FOR_ALL), "cleo")).toBe(true);
    expect(articleAppliesTo(article("1", ARTICLE_FOR_ALL), null)).toBe(true);
    expect(articleAppliesTo(article("2", ARTICLE_FOR_COMPANY), null)).toBe(
      true,
    );
    expect(articleAppliesTo(article("2", ARTICLE_FOR_COMPANY), "cleo")).toBe(
      false,
    );
    expect(articleAppliesTo(article("3", "cleo"), "cleo")).toBe(true);
    expect(articleAppliesTo(article("3", "cleo"), "noah")).toBe(false);
    expect(articleAppliesTo(article("3", "cleo"), null)).toBe(false);
  });

  it("offers a consultant's own articles first, then shared ones", () => {
    const list = [
      article("10", ARTICLE_FOR_ALL),
      article("2", ARTICLE_FOR_ALL),
      article("5", "cleo"),
      article("6", "noah"),
      article("7", ARTICLE_FOR_COMPANY),
      article("8", "cleo", "2027-01-01"),
    ];
    expect(
      articlesForInvoice(list, "cleo", "2026-11-06").map((item) => item.id),
    ).toEqual(["5", "2", "10"]);
    expect(
      articlesForInvoice(list, null, "2026-11-06").map((item) => item.id),
    ).toEqual(["7", "2", "10"]);
  });

  it("finds overlapping validity", () => {
    const first = { validFrom: "2026-01-01", validTo: "2026-06-30" };
    expect(
      validityOverlaps(first, { validFrom: "2026-07-01", validTo: null }),
    ).toBe(false);
    expect(
      validityOverlaps(first, { validFrom: "2026-06-30", validTo: null }),
    ).toBe(true);
    expect(
      validityOverlaps(
        { validFrom: "2026-01-01", validTo: null },
        { validFrom: "2030-01-01", validTo: "2030-02-01" },
      ),
    ).toBe(true);
  });

  it("says whether an article is active, upcoming or ended", () => {
    expect(articleStatus(article("1", ARTICLE_FOR_ALL), "2026-11-06")).toBe(
      "active",
    );
    expect(
      articleStatus(article("1", ARTICLE_FOR_ALL, "2027-01-01"), "2026-11-06"),
    ).toBe("upcoming");
    expect(
      articleStatus(
        article("1", ARTICLE_FOR_ALL, "2026-01-01", "2026-10-31"),
        "2026-11-06",
      ),
    ).toBe("ended");
  });
});
