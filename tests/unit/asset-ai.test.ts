import { describe, expect, it } from "vitest";
import {
  convertAssetExtractionToSek,
  normalizeAssetExtraction,
  type RawAssetExtraction,
  type RawAssetExtractionItem,
} from "@/domain/ai";
import { parseAssetForm } from "@/server/validators/assets";

const item = (
  overrides: Partial<RawAssetExtractionItem> = {},
): RawAssetExtractionItem => ({
  name: "Tablet",
  brand: "Apple",
  model: 'iPad Pro 13" (M5) 256GB WiFi',
  serialNumber: "",
  accessories: "",
  amount: 14_632,
  vatRatePercent: 25,
  ...overrides,
});

/** An order confirmation priced excluding VAT, with shipping on top. */
const raw = (
  overrides: Partial<RawAssetExtraction> = {},
): RawAssetExtraction => ({
  name: "  iPad Pro   with Apple Pencil ",
  category: "computer",
  supplier: "Elgiganten",
  date: "2026-10-27",
  currency: "sek",
  amountsIncludeVat: false,
  items: [item(), item({ name: "Stylus", model: "Pencil Pro", amount: 1_272 })],
  otherCosts: 79.2,
  totalAmount: 19_979,
  vatRatePercent: 25,
  ...overrides,
});

describe("asset details read with AI", () => {
  it("keeps every line with its price including VAT and makes the total add up", () => {
    const extraction = normalizeAssetExtraction(raw());
    expect(extraction).toMatchObject({
      name: "iPad Pro with Apple Pencil",
      category: "computer",
      supplier: "Elgiganten",
      date: "2026-10-27",
      currency: "SEK",
      grossMinor: 1_997_900,
      otherCostsMinor: 9_900,
      vatRateBps: 2_500,
    });
    expect(
      extraction.parts.map((part) => [part.name, part.priceMinor]),
    ).toEqual([
      ["Tablet", 1_829_000],
      ["Stylus", 159_000],
    ]);
  });

  it("takes line amounts that already include VAT as they are", () => {
    const extraction = normalizeAssetExtraction(
      raw({
        amountsIncludeVat: true,
        items: [item({ amount: 8_990 })],
        otherCosts: null,
        totalAmount: null,
      }),
    );
    expect(extraction.parts[0]?.priceMinor).toBe(899_000);
    expect(extraction.otherCostsMinor).toBe(0);
    expect(extraction.grossMinor).toBe(899_000);
  });

  it("drops unknown categories, bad dates and lines without a name", () => {
    const extraction = normalizeAssetExtraction(
      raw({
        category: "building",
        date: "2026-02-30",
        items: [
          item({ amount: null }),
          item({ name: "", brand: "", model: "" }),
        ],
        totalAmount: null,
        otherCosts: null,
        vatRatePercent: 24.9,
      }),
    );
    expect(extraction.category).toBeNull();
    expect(extraction.date).toBeNull();
    expect(extraction.parts).toHaveLength(1);
    expect(extraction.parts[0]?.priceMinor).toBe(0);
    expect(extraction.vatRateBps).toBe(2_500);
  });

  it("converts foreign prices to SEK and keeps the original total", () => {
    const extraction = convertAssetExtractionToSek(
      normalizeAssetExtraction(
        raw({
          currency: "EUR",
          amountsIncludeVat: true,
          items: [item({ amount: 90 })],
          otherCosts: null,
          totalAmount: 100,
        }),
      ),
      { rate: 11.5, date: "2026-10-02", source: "riksbank" },
    );
    expect(extraction.currency).toBe("SEK");
    expect(extraction.parts[0]?.priceMinor).toBe(103_500);
    expect(extraction.otherCostsMinor).toBe(11_500);
    expect(extraction.grossMinor).toBe(115_000);
    expect(extraction.conversion).toMatchObject({
      currency: "EUR",
      grossMinor: 10_000,
    });
  });
});

describe("the asset form", () => {
  it("reads the items and leaves out chosen expense files", () => {
    const form = new FormData();
    form.set("name", "iPad Pro with Apple Pencil");
    form.set("category", "computer");
    form.set(
      "parts",
      JSON.stringify([
        { name: "Tablet", make: "Apple", priceMinor: 1_829_000 },
        { name: "Stylus", make: "Apple", priceMinor: 159_000 },
      ]),
    );
    form.set("otherCostsMinor", "9900");
    form.append("skipSourceFileIds", "att-1");
    const parsed = parseAssetForm(form);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.parts).toHaveLength(2);
    expect(parsed.data?.otherCostsMinor).toBe(9_900);
    expect(parsed.data?.skipSourceFileIds).toEqual(["att-1"]);
  });

  it("needs at least one named item with a whole price in öre", () => {
    const parse = (parts: unknown) => {
      const form = new FormData();
      form.set("name", "Monitor");
      form.set("category", "monitor");
      form.set("parts", JSON.stringify(parts));
      return parseAssetForm(form).success;
    };
    expect(parse([])).toBe(false);
    expect(parse([{ name: "", priceMinor: 100 }])).toBe(false);
    expect(parse([{ name: "Monitor", priceMinor: 1.5 }])).toBe(false);
    expect(parse([{ name: "Monitor", priceMinor: 100 }])).toBe(true);
  });
});
