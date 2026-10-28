import { receiptVatRateBps } from "@/domain/receipts";

export type AiProvider = "anthropic" | "openai";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai"];

/** Portal areas an admin can switch AI on for, one at a time. */
export type AiFeature = "financeAttachments";
export const AI_FEATURES: AiFeature[] = ["financeAttachments"];

/** Suggested model IDs per provider; admins may also enter any other ID. */
export const AI_MODEL_PRESETS: Record<AiProvider, string[]> = {
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  openai: ["gpt-5-mini", "gpt-5"],
};

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-5-mini",
};

export type AiSettings = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  features: Record<AiFeature, boolean>;
};

/** Settings as stored, without secrets; missing or invalid values fall back. */
export function aiSettingsFrom(data: Record<string, unknown> | undefined) {
  const provider = AI_PROVIDERS.includes(data?.provider as AiProvider)
    ? (data!.provider as AiProvider)
    : "anthropic";
  const model =
    typeof data?.model === "string" && data.model.trim()
      ? data.model.trim()
      : DEFAULT_AI_MODEL[provider];
  const features = (data?.features ?? {}) as Partial<
    Record<AiFeature, unknown>
  >;
  return {
    enabled: data?.enabled === true,
    provider,
    model,
    features: Object.fromEntries(
      AI_FEATURES.map((feature) => [feature, features[feature] === true]),
    ) as Record<AiFeature, boolean>,
  } satisfies AiSettings;
}

export function aiFeatureEnabled(settings: AiSettings, feature: AiFeature) {
  return settings.enabled && settings.features[feature];
}

/** What the model is asked to return, amounts in major currency units. */
export type RawFinanceExtraction = {
  documentType: "receipt" | "invoice" | "other";
  direction: "income" | "expense" | null;
  date: string | null;
  currency: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  vatRatePercent: number | null;
  counterpartyName: string | null;
  description: string | null;
  categoryId: string | null;
};

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }],
});

/** JSON schema for structured output; every field is required but nullable. */
export const FINANCE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "direction",
    "date",
    "currency",
    "netAmount",
    "vatAmount",
    "totalAmount",
    "vatRatePercent",
    "counterpartyName",
    "description",
    "categoryId",
  ],
  properties: {
    documentType: { type: "string", enum: ["receipt", "invoice", "other"] },
    direction: nullable({ type: "string", enum: ["income", "expense"] }),
    date: nullable({ type: "string" }),
    currency: nullable({ type: "string" }),
    netAmount: nullable({ type: "number" }),
    vatAmount: nullable({ type: "number" }),
    totalAmount: nullable({ type: "number" }),
    vatRatePercent: nullable({ type: "number" }),
    counterpartyName: nullable({ type: "string" }),
    description: nullable({ type: "string" }),
    categoryId: nullable({ type: "string" }),
  },
};

export type SekExchangeRate = {
  /** SEK per one unit of the foreign currency. */
  rate: number;
  date: string;
  source: "riksbank" | "ecb";
};

export type FinanceExtraction = {
  direction: "income" | "expense" | null;
  date: string | null;
  /** Currency of the amounts below; SEK once converted. */
  currency: string;
  netMinor: number | null;
  vatMinor: number | null;
  grossMinor: number | null;
  vatRateBps: number | null;
  counterpartyName: string | null;
  description: string | null;
  categoryId: string | null;
  /** Set when foreign amounts were converted to SEK. */
  conversion: {
    currency: string;
    grossMinor: number | null;
    netMinor: number | null;
    rate: SekExchangeRate;
  } | null;
};

const SWEDISH_VAT_RATES_BPS = [0, 600, 1200, 2500];

function toMinor(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function snapVatRate(bps: number) {
  const nearest = SWEDISH_VAT_RATES_BPS.reduce((best, rate) =>
    Math.abs(rate - bps) < Math.abs(best - bps) ? rate : best,
  );
  return Math.abs(nearest - bps) <= 50 ? nearest : bps;
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function text(value: string | null, max: number) {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Turns model output into integer öre and a VAT rate the form can use,
 * filling in whichever of net, VAT and total the document left out.
 */
export function normalizeFinanceExtraction(
  raw: RawFinanceExtraction,
  categoryIds: string[],
): FinanceExtraction {
  let netMinor = toMinor(raw.netAmount);
  let vatMinor = toMinor(raw.vatAmount);
  let grossMinor = toMinor(raw.totalAmount);
  if (grossMinor === null && netMinor !== null && vatMinor !== null)
    grossMinor = netMinor + vatMinor;
  if (netMinor === null && grossMinor !== null && vatMinor !== null)
    netMinor = grossMinor - vatMinor;
  if (vatMinor === null && grossMinor !== null && netMinor !== null)
    vatMinor = grossMinor - netMinor;
  if (netMinor !== null && netMinor < 0) netMinor = null;
  if (vatMinor !== null && vatMinor < 0) vatMinor = null;

  let vatRateBps: number | null = null;
  if (netMinor !== null && vatMinor !== null && netMinor > 0)
    vatRateBps = snapVatRate(receiptVatRateBps(netMinor, vatMinor));
  else if (
    raw.vatRatePercent !== null &&
    Number.isFinite(raw.vatRatePercent) &&
    raw.vatRatePercent >= 0 &&
    raw.vatRatePercent <= 100
  )
    vatRateBps = Math.round(raw.vatRatePercent * 100);

  const currency = text(raw.currency, 10)?.toUpperCase() ?? null;
  return {
    direction:
      raw.direction === "income" || raw.direction === "expense"
        ? raw.direction
        : null,
    date: validDate(raw.date),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "SEK",
    netMinor,
    vatMinor,
    grossMinor,
    vatRateBps,
    counterpartyName: text(raw.counterpartyName, 120),
    description: text(raw.description, 200),
    categoryId:
      raw.categoryId && categoryIds.includes(raw.categoryId)
        ? raw.categoryId
        : null,
    conversion: null,
  };
}

/**
 * Converts foreign-currency amounts to SEK. Net and total are converted and
 * VAT is their difference, so the three always add up.
 */
export function convertExtractionToSek(
  extraction: FinanceExtraction,
  rate: SekExchangeRate,
): FinanceExtraction {
  const convert = (minor: number | null) =>
    minor === null ? null : Math.round(minor * rate.rate);
  const netMinor = convert(extraction.netMinor);
  const grossMinor = convert(extraction.grossMinor);
  return {
    ...extraction,
    currency: "SEK",
    netMinor,
    grossMinor,
    vatMinor:
      netMinor !== null && grossMinor !== null
        ? grossMinor - netMinor
        : convert(extraction.vatMinor),
    conversion: {
      currency: extraction.currency,
      grossMinor: extraction.grossMinor,
      netMinor: extraction.netMinor,
      rate,
    },
  };
}
