import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import {
  AI_FEATURES,
  AI_PROVIDERS,
  aiFeatureEnabled,
  aiSettingsFrom,
  DEFAULT_AI_MODEL,
  AI_PURPOSE_FEATURE,
  convertExtractionToSek,
  FINANCE_EXTRACTION_JSON_SCHEMA,
  MAX_SCHEMA_UNION_FIELDS,
  matchConsultantByName,
  normalizeFinanceExtraction,
  type RawFinanceExtraction,
} from "@/domain/ai";
import { aiSettingsSchema } from "@/server/validators/ai";
import {
  consultantServicesDescription,
  consultantServicesNote,
  validInvoicePeriod,
} from "@/domain/finance/invoice-period";

const empty: RawFinanceExtraction = {
  documentType: "receipt",
  direction: null,
  date: null,
  currency: null,
  netAmount: null,
  vatAmount: null,
  totalAmount: null,
  roundingAmount: null,
  vatRatePercent: null,
  counterpartyName: null,
  description: null,
  categoryId: null,
  consultantId: null,
  invoiceNumber: null,
  dueDate: null,
  periodFrom: null,
  periodTo: null,
  customerId: null,
  paymentReference: null,
};

describe("AI settings", () => {
  it("defaults to disabled Claude with every section off", () => {
    expect(aiSettingsFrom(undefined)).toEqual({
      enabled: false,
      provider: "anthropic",
      model: DEFAULT_AI_MODEL.anthropic,
      features: {
        financeAttachments: false,
        financeInvoices: false,
        financeVatSettlements: false,
      },
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
    expect(aiFeatureEnabled(on, "financeInvoices")).toBe(false);
    expect(
      aiFeatureEnabled({ ...on, enabled: false }, "financeAttachments"),
    ).toBe(false);
    expect(
      aiFeatureEnabled(
        {
          ...on,
          features: {
            financeAttachments: false,
            financeInvoices: true,
            financeVatSettlements: false,
          },
        },
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
    expect(aiSettingsSchema.safeParse(valid).data?.features).toEqual({
      financeAttachments: true,
      financeInvoices: false,
      financeVatSettlements: false,
    });
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
      roundingMinor: null,
      grossMinor: 100_000,
      vatRateBps: 2500,
      counterpartyName: "Kontorsbolaget AB",
      description: "Printer paper",
      categoryId: "office",
      consultantId: null,
      funding: null,
      invoiceNumber: null,
      dueDate: null,
      periodFrom: null,
      periodTo: null,
      customerId: null,
      paymentReference: null,
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

  it("keeps öresavrundning out of net and VAT", () => {
    const receipt = { ...empty, netAmount: 229, vatAmount: 57.25 };
    expect(
      normalizeFinanceExtraction(
        { ...receipt, totalAmount: 286, roundingAmount: -0.25 },
        [],
      ),
    ).toMatchObject({
      netMinor: 22_900,
      vatMinor: 5_725,
      roundingMinor: -25,
      grossMinor: 28_600,
      vatRateBps: 2500,
    });
    expect(
      normalizeFinanceExtraction({ ...receipt, roundingAmount: -0.25 }, [])
        .grossMinor,
    ).toBe(28_600);
    expect(
      normalizeFinanceExtraction(
        { ...empty, totalAmount: 286, vatAmount: 57.25, roundingAmount: -0.25 },
        [],
      ).netMinor,
    ).toBe(22_900);
    expect(
      normalizeFinanceExtraction({ ...receipt, roundingAmount: 0 }, [])
        .roundingMinor,
    ).toBeNull();
    expect(
      normalizeFinanceExtraction({ ...receipt, roundingAmount: 5_000 }, [])
        .roundingMinor,
    ).toBeNull();
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

describe("matchConsultantByName", () => {
  const consultants = [
    { id: "anna", displayName: "Anna Lindqvist" },
    { id: "erik", displayName: "Erik Åström" },
    { id: "anna-b", displayName: "Anna Berg" },
  ];

  it("prefers a full name, ignoring case, separators and accents", () => {
    expect(matchConsultantByName("kvitto_anna-berg.pdf", consultants)).toBe(
      "anna-b",
    );
    expect(matchConsultantByName("Taxi ERIK ASTROM.jpg", consultants)).toBe(
      "erik",
    );
  });

  it("matches a first or last name only one consultant has", () => {
    expect(matchConsultantByName("Lindqvist hotel.pdf", consultants)).toBe(
      "anna",
    );
    expect(matchConsultantByName("erik-lunch.png", consultants)).toBe("erik");
  });

  it("returns null when the name is shared, missing or only part of a word", () => {
    expect(matchConsultantByName("anna.pdf", consultants)).toBeNull();
    expect(
      matchConsultantByName("Receipt-2137-5228.pdf", consultants),
    ).toBeNull();
    expect(matchConsultantByName("Bergsgatan 4.pdf", consultants)).toBeNull();
    expect(
      matchConsultantByName("erik and lindqvist.pdf", consultants),
    ).toBeNull();
  });
});

describe("consultant in AI output", () => {
  it("keeps only a known consultant id", () => {
    expect(
      normalizeFinanceExtraction(
        { ...empty, consultantId: "anna" },
        [],
        ["anna"],
      ).consultantId,
    ).toBe("anna");
    expect(
      normalizeFinanceExtraction(
        { ...empty, consultantId: "made-up" },
        [],
        ["anna"],
      ).consultantId,
    ).toBeNull();
  });
});

describe("invoice fields in AI output", () => {
  it("keeps the invoice number, a known customer and a valid due date", () => {
    expect(
      normalizeFinanceExtraction(
        {
          ...empty,
          date: "2026-10-01",
          dueDate: "2026-10-31",
          invoiceNumber: "  2026-117 ",
          customerId: "acme",
        },
        [],
        [],
        ["acme"],
      ),
    ).toMatchObject({
      invoiceNumber: "2026-117",
      dueDate: "2026-10-31",
      customerId: "acme",
    });
  });

  it("drops unknown customers and due dates before the invoice date", () => {
    expect(
      normalizeFinanceExtraction(
        {
          ...empty,
          date: "2026-10-01",
          dueDate: "2026-09-30",
          customerId: "made-up",
        },
        [],
        [],
        ["acme"],
      ),
    ).toMatchObject({ dueDate: null, customerId: null });
  });

  it("maps each purpose to its own switch", () => {
    expect(AI_PURPOSE_FEATURE).toEqual({
      transaction: "financeAttachments",
      invoice: "financeInvoices",
      vatSettlement: "financeVatSettlements",
    });
  });
});

describe("invoice period", () => {
  it("keeps a valid period from AI output and drops a reversed one", () => {
    expect(
      normalizeFinanceExtraction(
        { ...empty, periodFrom: "2026-01-01", periodTo: "2026-01-31" },
        [],
      ),
    ).toMatchObject({ periodFrom: "2026-01-01", periodTo: "2026-01-31" });
    expect(
      normalizeFinanceExtraction(
        { ...empty, periodFrom: "2026-02-01", periodTo: "2026-01-31" },
        [],
      ),
    ).toMatchObject({ periodFrom: null, periodTo: null });
    expect(
      normalizeFinanceExtraction({ ...empty, periodFrom: "2026-01-01" }, []),
    ).toMatchObject({ periodFrom: null, periodTo: null });
  });

  it("accepts both dates or neither", () => {
    expect(validInvoicePeriod(null, null)).toBe(true);
    expect(validInvoicePeriod("2026-01-01", "2026-01-31")).toBe(true);
    expect(validInvoicePeriod("2026-01-01", null)).toBe(false);
    expect(validInvoicePeriod("2026-02-01", "2026-01-31")).toBe(false);
  });

  it("names the months in the consultant description", () => {
    expect(
      consultantServicesDescription("Anna Berg", "2026-01-01", "2026-01-31"),
    ).toBe("Consultant services - Anna Berg - Jan-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2026-01-01", "2026-02-28"),
    ).toBe("Consultant services - Anna Berg - Jan-Feb-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2026-08-24", "2026-09-27"),
    ).toBe("Consultant services - Anna Berg - Aug24-Sep27-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2026-02-01", "2026-02-28"),
    ).toBe("Consultant services - Anna Berg - Feb-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2026-02-02", "2026-02-27"),
    ).toBe("Consultant services - Anna Berg - Feb2-Feb27-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2025-12-24", "2026-01-27"),
    ).toBe("Consultant services - Anna Berg - Dec24-2025-Jan27-2026");
    expect(
      consultantServicesDescription("Anna Berg", "2025-12-01", "2026-01-31"),
    ).toBe("Consultant services - Anna Berg - Dec-2025-Jan-2026");
    expect(consultantServicesDescription("Anna Berg", null, null)).toBeNull();
    expect(
      consultantServicesDescription("", "2026-01-01", "2026-01-31"),
    ).toBeNull();
  });
});

describe("extraction schema", () => {
  it("stays within the provider limit on union-typed fields", () => {
    const unions = Object.values(
      FINANCE_EXTRACTION_JSON_SCHEMA.properties,
    ).filter(
      (property) =>
        "anyOf" in property ||
        Array.isArray((property as { type?: unknown }).type),
    );
    expect(unions.length).toBeLessThanOrEqual(MAX_SCHEMA_UNION_FIELDS);
  });

  it("treats empty text from the model as unknown", () => {
    expect(
      normalizeFinanceExtraction(
        {
          ...empty,
          date: "",
          currency: "",
          counterpartyName: "",
          categoryId: "",
          consultantId: "",
          invoiceNumber: "",
          dueDate: "",
          periodFrom: "",
          periodTo: "",
          customerId: "",
        },
        ["office"],
        ["anna"],
        ["acme"],
      ),
    ).toMatchObject({
      date: null,
      currency: "SEK",
      counterpartyName: null,
      categoryId: null,
      consultantId: null,
      invoiceNumber: null,
      dueDate: null,
      periodFrom: null,
      periodTo: null,
      customerId: null,
    });
  });
});

describe("consultantServicesNote", () => {
  it("puts the customer before the consultant description", () => {
    expect(
      consultantServicesNote(
        "Ework Group AB",
        "Shahab Bagheri",
        "2026-08-01",
        "2026-09-30",
      ),
    ).toBe(
      "Ework Group AB - Consultant services - Shahab Bagheri - Aug-Sep-2026",
    );
    expect(
      consultantServicesNote("", "Shahab Bagheri", "2026-08-01", "2026-09-30"),
    ).toBe("Consultant services - Shahab Bagheri - Aug-Sep-2026");
    expect(
      consultantServicesNote("Ework Group AB", "", "2026-08-01", "2026-09-30"),
    ).toBeNull();
  });
});

describe("VAT settlement fields in AI output", () => {
  it("keeps the OCR reference and treats empty text as unknown", () => {
    expect(
      normalizeFinanceExtraction(
        { ...empty, paymentReference: " 1655955584297 " },
        [],
      ).paymentReference,
    ).toBe("1655955584297");
    expect(
      normalizeFinanceExtraction({ ...empty, paymentReference: "" }, [])
        .paymentReference,
    ).toBeNull();
  });
});
