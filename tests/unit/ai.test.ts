import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import {
  AI_FEATURES,
  AI_PROVIDERS,
  aiFeatureEnabled,
  aiSettingsFrom,
  DEFAULT_AI_MODEL,
  convertExtractionToSek,
  normalizeFinanceExtraction,
  type RawFinanceExtraction,
} from "@/domain/ai";
import { aiSettingsSchema } from "@/server/validators/ai";

const empty: RawFinanceExtraction = {
  documentType: "receipt",
  direction: null,
  date: null,
  currency: null,
  netAmount: null,
  vatAmount: null,
  totalAmount: null,
  vatRatePercent: null,
  counterpartyName: null,
  description: null,
  categoryId: null,
};

describe("AI settings", () => {
  it("defaults to disabled Claude with every section off", () => {
    expect(aiSettingsFrom(undefined)).toEqual({
      enabled: false,
      provider: "anthropic",
      model: DEFAULT_AI_MODEL.anthropic,
      features: { financeAttachments: false },
    });
  });

  it("requires both the master switch and the section", () => {
    const on = aiSettingsFrom({
      enabled: true,
      provider: "openai",
      model: "gpt-5",
      features: { financeAttachments: true },
    });
    expect(aiFeatureEnabled(on, "financeAttachments")).toBe(true);
    expect(
      aiFeatureEnabled({ ...on, enabled: false }, "financeAttachments"),
    ).toBe(false);
    expect(
      aiFeatureEnabled(
        { ...on, features: { financeAttachments: false } },
        "financeAttachments",
      ),
    ).toBe(false);
  });

  it("falls back on unknown providers and blank models", () => {
    expect(aiSettingsFrom({ provider: "gemini", model: " " })).toMatchObject({
      provider: "anthropic",
      model: DEFAULT_AI_MODEL.anthropic,
    });
  });

  it("validates admin input", () => {
    const valid = {
      enabled: true,
      provider: "anthropic",
      model: "claude-haiku-5-5",
      features: { financeAttachments: true },
    };
    expect(aiSettingsSchema.safeParse(valid).success).toBe(true);
    expect(
      aiSettingsSchema.safeParse({ ...valid, provider: "gemini" }).success,
    ).toBe(false);
    expect(
      aiSettingsSchema.safeParse({ ...valid, model: "bad model" }).success,
    ).toBe(false);
  });

  it("has labels for every provider and section in both languages", () => {
    for (const catalog of [en, sv] as Record<string, string>[]) {
      for (const provider of AI_PROVIDERS)
        expect(catalog[`aiProvider_${provider}`]).toBeTruthy();
      for (const feature of AI_FEATURES) {
        expect(catalog[`aiFeature_${feature}`]).toBeTruthy();
        expect(catalog[`aiFeatureHelp_${feature}`]).toBeTruthy();
      }
    }
  });
});

describe("normalizeFinanceExtraction", () => {
  it("converts kronor to öre and derives the VAT rate", () => {
    expect(
      normalizeFinanceExtraction(
        {
          ...empty,
          direction: "expense",
          date: "2026-10-12",
          currency: "sek",
          netAmount: 800,
          vatAmount: 200,
          totalAmount: 1000,
          vatRatePercent: 25,
          counterpartyName: "  Kontorsbolaget  AB ",
          description: "Printer paper",
          categoryId: "office",
        },
        ["office"],
      ),
    ).toEqual({
      direction: "expense",
      date: "2026-10-12",
      currency: "SEK",
      netMinor: 80_000,
      vatMinor: 20_000,
      grossMinor: 100_000,
      vatRateBps: 2500,
      counterpartyName: "Kontorsbolaget AB",
      description: "Printer paper",
      categoryId: "office",
      conversion: null,
    });
  });

  it("fills in the missing one of net, VAT and total", () => {
    expect(
      normalizeFinanceExtraction(
        { ...empty, totalAmount: 112, vatAmount: 12 },
        [],
      ),
    ).toMatchObject({
      netMinor: 10_000,
      vatMinor: 1_200,
      grossMinor: 11_200,
      vatRateBps: 1200,
    });
    expect(
      normalizeFinanceExtraction(
        { ...empty, netAmount: 100, totalAmount: 106 },
        [],
      ).vatMinor,
    ).toBe(600);
  });

  it("snaps rounding noise to Swedish VAT rates", () => {
    expect(
      normalizeFinanceExtraction(
        { ...empty, netAmount: 79.99, vatAmount: 20.01 },
        [],
      ).vatRateBps,
    ).toBe(2500);
  });

  it("uses the stated rate when amounts are missing", () => {
    expect(
      normalizeFinanceExtraction({ ...empty, vatRatePercent: 6 }, [])
        .vatRateBps,
    ).toBe(600);
  });

  it("drops invalid dates, currencies, categories and negative amounts", () => {
    expect(
      normalizeFinanceExtraction(
        {
          ...empty,
          date: "2026-02-30",
          currency: "kronor",
          netAmount: -5,
          categoryId: "made-up",
        },
        ["office"],
      ),
    ).toMatchObject({
      date: null,
      currency: "SEK",
      netMinor: null,
      categoryId: null,
    });
  });

  it("treats a missing currency as SEK", () => {
    expect(normalizeFinanceExtraction(empty, []).currency).toBe("SEK");
  });
});

describe("convertExtractionToSek", () => {
  it("converts net and total and keeps VAT their difference", () => {
    const euro = normalizeFinanceExtraction(
      { ...empty, currency: "EUR", netAmount: 89.6, totalAmount: 112 },
      [],
    );
    const rate = {
      rate: 11.0795,
      date: "2026-10-27",
      source: "riksbank",
    } as const;
    expect(convertExtractionToSek(euro, rate)).toMatchObject({
      currency: "SEK",
      netMinor: 99_272,
      grossMinor: 124_090,
      vatMinor: 24_818,
      vatRateBps: 2500,
      conversion: {
        currency: "EUR",
        grossMinor: 11_200,
        netMinor: 8_960,
        rate,
      },
    });
  });
});
