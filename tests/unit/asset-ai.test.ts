import { describe, expect, it } from "vitest";
import {
  convertAssetExtractionToSek,
  normalizeAssetExtraction,
  type RawAssetExtraction,
} from "@/domain/ai";
import { parseAssetForm } from "@/server/validators/assets";

const raw = (
  overrides: Partial<RawAssetExtraction> = {},
): RawAssetExtraction => ({
  name: "  Monitor   27 inch ",
  category: "monitor",
  brand: "Dell",
  model: "U2724D",
  serialNumber: "CN0000002",
  accessories: "",
  supplier: "Dustin",
  date: "2026-10-02",
  currency: "sek",
  netAmount: 7192,
  vatAmount: 1798,
  totalAmount: null,
  vatRatePercent: null,
  ...overrides,
});

describe("asset details read with AI", () => {
  it("cleans text, keeps known categories and works out the price with VAT", () => {
    const extraction = normalizeAssetExtraction(raw());
    expect(extraction).toMatchObject({
      name: "Monitor 27 inch",
      category: "monitor",
      make: "Dell",
      model: "U2724D",
      serialNumber: "CN0000002",
      accessories: null,
      supplier: "Dustin",
      date: "2026-10-02",
      currency: "SEK",
      grossMinor: 899_000,
      vatRateBps: 2_500,
    });
  });

  it("drops unknown categories, bad dates and negative amounts", () => {
    const extraction = normalizeAssetExtraction(
      raw({
        category: "building",
        date: "2026-02-30",
        netAmount: null,
        vatAmount: null,
        totalAmount: -5,
        vatRatePercent: 24.9,
      }),
    );
    expect(extraction.category).toBeNull();
    expect(extraction.date).toBeNull();
    expect(extraction.grossMinor).toBeNull();
    expect(extraction.vatRateBps).toBe(2_500);
  });

  it("converts a foreign price to SEK and keeps the original", () => {
    const extraction = convertAssetExtractionToSek(
      normalizeAssetExtraction(
        raw({ currency: "EUR", netAmount: null, totalAmount: 100 }),
      ),
      { rate: 11.5, date: "2026-10-02", source: "riksbank" },
    );
    expect(extraction.currency).toBe("SEK");
    expect(extraction.grossMinor).toBe(115_000);
    expect(extraction.conversion).toMatchObject({
      currency: "EUR",
      grossMinor: 10_000,
    });
  });
});

describe("creating an asset from an expense", () => {
  it("lists the expense files to leave out", () => {
    const form = new FormData();
    form.set("name", "Monitor");
    form.set("category", "monitor");
    form.append("skipSourceFileIds", "att-1");
    const parsed = parseAssetForm(form);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.skipSourceFileIds).toEqual(["att-1"]);
  });
});
