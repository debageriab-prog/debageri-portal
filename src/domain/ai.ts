import { receiptVatRateBps } from "@/domain/receipts";
import { MAX_ROUNDING_MINOR } from "@/domain/finance/calculations";
import { validInvoicePeriod } from "@/domain/finance/invoice-period";

export type AiProvider = "anthropic" | "openai";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai"];

/** Portal areas an admin can switch AI on for, one at a time. */
export type AiFeature = "financeAttachments" | "financeInvoices";
export const AI_FEATURES: AiFeature[] = [
  "financeAttachments",
  "financeInvoices",
];

/** What a document is read for; each purpose has its own AI switch. */
export type AiExtractionPurpose = "transaction" | "invoice";
export const AI_PURPOSE_FEATURE: Record<AiExtractionPurpose, AiFeature> = {
  transaction: "financeAttachments",
  invoice: "financeInvoices",
};

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
  roundingAmount: number | null;
  vatRatePercent: number | null;
  counterpartyName: string | null;
  description: string | null;
  categoryId: string | null;
  consultantId: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  customerId: string | null;
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
    "roundingAmount",
    "vatRatePercent",
    "counterpartyName",
    "description",
    "categoryId",
    "consultantId",
    "invoiceNumber",
    "dueDate",
    "periodFrom",
    "periodTo",
    "customerId",
  ],
  properties: {
    documentType: { type: "string", enum: ["receipt", "invoice", "other"] },
    direction: nullable({ type: "string", enum: ["income", "expense"] }),
    date: nullable({ type: "string" }),
    currency: nullable({ type: "string" }),
    netAmount: nullable({ type: "number" }),
    vatAmount: nullable({ type: "number" }),
    totalAmount: nullable({ type: "number" }),
    roundingAmount: nullable({ type: "number" }),
    vatRatePercent: nullable({ type: "number" }),
    counterpartyName: nullable({ type: "string" }),
    description: nullable({ type: "string" }),
    categoryId: nullable({ type: "string" }),
    consultantId: nullable({ type: "string" }),
    invoiceNumber: nullable({ type: "string" }),
    dueDate: nullable({ type: "string" }),
    periodFrom: nullable({ type: "string" }),
    periodTo: nullable({ type: "string" }),
    customerId: nullable({ type: "string" }),
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
  /** Öresavrundning, plus or minus, included in `grossMinor`. */
  roundingMinor: number | null;
  grossMinor: number | null;
  vatRateBps: number | null;
  counterpartyName: string | null;
  description: string | null;
  categoryId: string | null;
  /** Consultant named in the file name or document. */
  consultantId: string | null;
  /** How this consultant's latest expense in the category was paid. */
  funding: "company" | "consultant" | null;
  invoiceNumber: string | null;
  /** Never before `date`. */
  dueDate: string | null;
  /** Service period the invoice covers; both set or both null. */
  periodFrom: string | null;
  periodTo: string | null;
  customerId: string | null;
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

/** Signed rounding in öre; null when absent, zero or implausibly large. */
function toRoundingMinor(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const minor = Math.round(value * 100);
  return minor !== 0 && Math.abs(minor) <= MAX_ROUNDING_MINOR ? minor : null;
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
 * filling in whichever of net, VAT and total the document left out. The
 * total includes any rounding: total = net + VAT + rounding.
 */
export function normalizeFinanceExtraction(
  raw: RawFinanceExtraction,
  categoryIds: string[],
  consultantIds: string[] = [],
  customerIds: string[] = [],
): FinanceExtraction {
  let netMinor = toMinor(raw.netAmount);
  let vatMinor = toMinor(raw.vatAmount);
  let grossMinor = toMinor(raw.totalAmount);
  const roundingMinor = toRoundingMinor(raw.roundingAmount);
  const rounding = roundingMinor ?? 0;
  if (grossMinor === null && netMinor !== null && vatMinor !== null)
    grossMinor = netMinor + vatMinor + rounding;
  if (netMinor === null && grossMinor !== null && vatMinor !== null)
    netMinor = grossMinor - rounding - vatMinor;
  if (vatMinor === null && grossMinor !== null && netMinor !== null)
    vatMinor = grossMinor - rounding - netMinor;
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
  const date = validDate(raw.date);
  const dueDate = validDate(raw.dueDate);
  const periodFrom = validDate(raw.periodFrom);
  const periodTo = validDate(raw.periodTo);
  const period =
    periodFrom && periodTo && validInvoicePeriod(periodFrom, periodTo);
  return {
    direction:
      raw.direction === "income" || raw.direction === "expense"
        ? raw.direction
        : null,
    date,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "SEK",
    netMinor,
    vatMinor,
    roundingMinor,
    grossMinor,
    vatRateBps,
    counterpartyName: text(raw.counterpartyName, 120),
    description: text(raw.description, 200),
    categoryId:
      raw.categoryId && categoryIds.includes(raw.categoryId)
        ? raw.categoryId
        : null,
    consultantId:
      raw.consultantId && consultantIds.includes(raw.consultantId)
        ? raw.consultantId
        : null,
    funding: null,
    invoiceNumber: text(raw.invoiceNumber, 60),
    dueDate: dueDate && (!date || dueDate >= date) ? dueDate : null,
    periodFrom: period ? periodFrom : null,
    periodTo: period ? periodTo : null,
    customerId:
      raw.customerId && customerIds.includes(raw.customerId)
        ? raw.customerId
        : null,
    conversion: null,
  };
}

function nameWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 2);
}

/**
 * The consultant named in `text` (such as a file name): a full-name match
 * wins, otherwise a first or last name no other consultant shares. Null when
 * nobody or more than one consultant matches. Accents are ignored.
 */
export function matchConsultantByName(
  text: string,
  consultants: { id: string; displayName: string }[],
) {
  const words = new Set(nameWords(text));
  const names = consultants.map((consultant) => ({
    id: consultant.id,
    parts: nameWords(consultant.displayName),
  }));
  const only = (ids: string[]) => (ids.length === 1 ? ids[0] : null);
  const full = names
    .filter(({ parts }) => parts.length > 1)
    .filter(({ parts }) => parts.every((part) => words.has(part)))
    .map(({ id }) => id);
  if (full.length) return only(full);
  const owners = new Map<string, Set<string>>();
  for (const { id, parts } of names)
    for (const part of [parts[0], parts.at(-1)].filter(Boolean) as string[])
      owners.set(part, (owners.get(part) ?? new Set()).add(id));
  const partial = new Set(
    [...words]
      .map((word) => owners.get(word))
      .flatMap((ids) => (ids?.size === 1 ? [...ids] : [])),
  );
  return only([...partial]);
}

/**
 * Converts foreign-currency amounts to SEK. Net, rounding and total are
 * converted and VAT is what remains, so the amounts always add up.
 */
export function convertExtractionToSek(
  extraction: FinanceExtraction,
  rate: SekExchangeRate,
): FinanceExtraction {
  const convert = (minor: number | null) =>
    minor === null ? null : Math.round(minor * rate.rate);
  const netMinor = convert(extraction.netMinor);
  const grossMinor = convert(extraction.grossMinor);
  const roundingMinor = convert(extraction.roundingMinor) || null;
  return {
    ...extraction,
    currency: "SEK",
    netMinor,
    grossMinor,
    roundingMinor,
    vatMinor:
      netMinor !== null && grossMinor !== null
        ? grossMinor - netMinor - (roundingMinor ?? 0)
        : convert(extraction.vatMinor),
    conversion: {
      currency: extraction.currency,
      grossMinor: extraction.grossMinor,
      netMinor: extraction.netMinor,
      rate,
    },
  };
}
