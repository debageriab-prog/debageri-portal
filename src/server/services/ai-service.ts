import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { PortalUser } from "@/domain/types";
import {
  AI_PURPOSE_FEATURE,
  aiFeatureEnabled,
  aiSettingsFrom,
  convertExtractionToSek,
  FINANCE_EXTRACTION_JSON_SCHEMA,
  matchConsultantByName,
  normalizeFinanceExtraction,
  type AiExtractionPurpose,
  type AiFeature,
  type AiProvider,
  type FinanceExtraction,
  type RawFinanceExtraction,
} from "@/domain/ai";
import {
  decryptPassword,
  encryptPassword,
} from "@/server/services/reminder-service";
import type { aiSettingsSchema } from "@/server/validators/ai";
import { sekExchangeRate } from "@/server/services/exchange-rate-service";

export class AiError extends Error {
  constructor(
    public code:
      | "aiDisabled"
      | "aiNotConfigured"
      | "aiUnsupportedFile"
      | "aiProviderRejected"
      | "aiProviderFailed"
      | "aiNoResult",
    public status: number,
    /** Provider's own error text, shown to finance users to help fix setup. */
    public detail?: string,
  ) {
    super(code);
  }
}

function providerDetail(status: number | undefined, message: string) {
  return `${status ?? ""} ${message}`.replace(/\s+/g, " ").trim().slice(0, 300);
}

const SETTINGS_COLLECTION = "aiSettings";

export async function readAiSettings(db: Firestore, organizationId: string) {
  const data = (
    await db.collection(SETTINGS_COLLECTION).doc(organizationId).get()
  ).data();
  const keys = (data?.encryptedApiKeys ?? {}) as Partial<
    Record<AiProvider, string>
  >;
  return {
    settings: aiSettingsFrom(data),
    keyConfigured: {
      anthropic: Boolean(keys.anthropic),
      openai: Boolean(keys.openai),
    } as Record<AiProvider, boolean>,
    encryptedKeys: keys,
  };
}

export async function isAiFeatureEnabled(
  db: Firestore,
  organizationId: string,
  feature: AiFeature,
) {
  const { settings, keyConfigured } = await readAiSettings(db, organizationId);
  return (
    aiFeatureEnabled(settings, feature) && keyConfigured[settings.provider]
  );
}

export async function saveAiSettings(
  db: Firestore,
  actor: PortalUser,
  input: z.infer<typeof aiSettingsSchema>,
) {
  if (actor.role !== "admin") throw new AiError("aiDisabled", 403);
  const ref = db.collection(SETTINGS_COLLECTION).doc(actor.organizationId);
  const { encryptedKeys } = await readAiSettings(db, actor.organizationId);
  if (input.enabled && !input.apiKey && !encryptedKeys[input.provider])
    throw new AiError("aiNotConfigured", 400);
  const { apiKey, ...settings } = input;
  await db.runTransaction(async (transaction) => {
    transaction.set(
      ref,
      {
        organizationId: actor.organizationId,
        ...settings,
        ...(apiKey
          ? { encryptedApiKeys: { [input.provider]: encryptPassword(apiKey) } }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.id,
      },
      { merge: true },
    );
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "aiSettingsUpdated",
      entityType: "aiSettings",
      entityId: actor.organizationId,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { ...settings, apiKeyChanged: Boolean(apiKey) },
    });
  });
}

export type ExtractionFile = {
  name: string;
  contentType: string;
  bytes: Buffer;
};

type ExtractionContext = {
  organizationName: string;
  purpose: AiExtractionPurpose;
  categories: { id: string; direction: string; name: string }[];
  consultants: { id: string; displayName: string }[];
  customers: { id: string; name: string }[];
};

const rawExtractionSchema = z.object({
  documentType: z.enum(["receipt", "invoice", "other"]),
  direction: z.enum(["income", "expense"]).nullable(),
  date: z.string().nullable(),
  currency: z.string().nullable(),
  netAmount: z.number().nullable(),
  vatAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  roundingAmount: z.number().nullable().default(null),
  vatRatePercent: z.number().nullable(),
  counterpartyName: z.string().nullable(),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  consultantId: z.string().nullable().default(null),
  invoiceNumber: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  periodFrom: z.string().nullable().default(null),
  periodTo: z.string().nullable().default(null),
  customerId: z.string().nullable().default(null),
}) satisfies z.ZodType<RawFinanceExtraction>;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_EMAIL_CHARS = 60_000;

function instructions(context: ExtractionContext) {
  return [
    context.purpose === "invoice"
      ? `You read customer invoices issued by the Swedish company "${context.organizationName}" and extract the values needed to register the invoice.`
      : `You read bookkeeping documents (receipts, supplier invoices, customer invoices, order confirmations) for the Swedish company "${context.organizationName}" and extract the values needed to post one ledger transaction.`,
    "Rules:",
    '- direction: "expense" when the company is the buyer or payer, "income" when the company issued the invoice or receives the money, null if unclear.',
    "- date: the invoice or purchase date (not the due date) as YYYY-MM-DD.",
    "- currency: ISO 4217 code of the amounts, such as SEK or EUR. Use SEK when the document does not state or clearly imply another currency. Do not convert amounts yourself; report them in the document's currency.",
    "- netAmount, vatAmount, totalAmount: the document's totals in major units (kronor, not öre) as plain numbers. netAmount excludes VAT (moms), totalAmount is the final amount to pay including VAT and any rounding. If the document has several VAT rates, return the summed totals and the dominant rate in vatRatePercent.",
    '- roundingAmount: a separate rounding line such as "Öresavrundning", "Avrundning" or "Rounding", signed as printed (for example -0.25 or 0.40), in major units. Do not fold it into netAmount or vatAmount. null when the document has no rounding line.',
    "- vatRatePercent: e.g. 25, 12, 6 or 0.",
    "- counterpartyName: the other party (the supplier for expenses, the customer for income).",
    "- description: a short description of what was bought or sold, in the document's language, at most 15 words.",
    context.purpose === "invoice"
      ? "- categoryId: always null."
      : "- categoryId: the id of the best matching category from the list below for the chosen direction, or null if none fits.",
    "- invoiceNumber: the invoice number (fakturanummer) exactly as printed, or null.",
    "- dueDate: the due date (förfallodatum) as YYYY-MM-DD, or null.",
    '- periodFrom, periodTo: the service period the invoice covers (for example "Period", "Avser", "Avser period", "Tidsperiod") as YYYY-MM-DD. When only a month is stated, such as "januari 2026", use its first and last day. null for both when no period is stated.',
    context.customers.length
      ? "- customerId: the id of the customer from the customer list below that the invoice is addressed to, or null if none matches."
      : "- customerId: always null.",
    '- consultantId: the id of the consultant from the consultant list below whose full name, first name or last name appears in the document, for example as buyer, cardholder, passenger, guest, "Er referens" or recipient. null if no consultant is named or the name could belong to more than one of them.',
    "Use null for any value that is not clearly stated or derivable from the document. Never guess amounts.",
    'Text fields cannot be null: wherever these rules say null for a text value (dates, currency, names, ids, invoice number, description), return an empty string "" instead.',
    "Categories (id | direction | name):",
    ...context.categories.map(
      (category) => `${category.id} | ${category.direction} | ${category.name}`,
    ),
    "Consultants (id | name):",
    ...context.consultants.map(
      (consultant) => `${consultant.id} | ${consultant.displayName}`,
    ),
    ...(context.customers.length
      ? [
          "Customers (id | name):",
          ...context.customers.map(
            (customer) => `${customer.id} | ${customer.name}`,
          ),
        ]
      : []),
  ].join("\n");
}

/** Plain-text view of an .eml file; binary parts are dropped. */
function emailText(bytes: Buffer) {
  const raw = bytes.toString("utf8");
  return raw
    .replace(/^[A-Za-z0-9+/=]{60,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, MAX_EMAIL_CHARS);
}

async function callAnthropic(
  apiKey: string,
  model: string,
  file: ExtractionFile,
  system: string,
) {
  const client = new Anthropic({ apiKey, timeout: 90_000 });
  const data = file.bytes.toString("base64");
  const source: Anthropic.ContentBlockParam =
    file.contentType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : IMAGE_TYPES.includes(file.contentType as ImageType)
        ? {
            type: "image",
            source: {
              type: "base64",
              media_type: file.contentType as ImageType,
              data,
            },
          }
        : { type: "text", text: emailText(file.bytes) };
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: FINANCE_EXTRACTION_JSON_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            source,
            {
              type: "text",
              text: `Extract the transaction values from the attached file "${file.name}".`,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal")
      throw new AiError("aiNoResult", 422);
    return response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error instanceof Anthropic.NotFoundError ||
      error instanceof Anthropic.BadRequestError
    ) {
      console.error("Anthropic rejected the extraction request", {
        status: error.status,
        message: error.message,
      });
      throw new AiError(
        "aiProviderRejected",
        502,
        providerDetail(error.status, error.message),
      );
    }
    console.error("Anthropic extraction failed", error);
    throw new AiError("aiProviderFailed", 502);
  }
}

async function callOpenAi(
  apiKey: string,
  model: string,
  file: ExtractionFile,
  system: string,
) {
  const client = new OpenAI({ apiKey, timeout: 90_000 });
  const data = file.bytes.toString("base64");
  const source: OpenAI.Responses.ResponseInputContent =
    file.contentType === "application/pdf"
      ? {
          type: "input_file",
          filename: file.name.toLowerCase().endsWith(".pdf")
            ? file.name
            : `${file.name}.pdf`,
          file_data: `data:application/pdf;base64,${data}`,
        }
      : IMAGE_TYPES.includes(file.contentType as ImageType)
        ? {
            type: "input_image",
            detail: "high",
            image_url: `data:${file.contentType};base64,${data}`,
          }
        : { type: "input_text", text: emailText(file.bytes) };
  try {
    const response = await client.responses.create({
      model,
      instructions: system,
      input: [
        {
          role: "user",
          content: [
            source,
            {
              type: "input_text",
              text: `Extract the transaction values from the attached file "${file.name}".`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "finance_document",
          strict: true,
          schema: FINANCE_EXTRACTION_JSON_SCHEMA,
        },
      },
    });
    return response.output_text;
  } catch (error) {
    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError ||
      error instanceof OpenAI.NotFoundError ||
      error instanceof OpenAI.BadRequestError
    ) {
      console.error("OpenAI rejected the extraction request", {
        status: error.status,
        message: error.message,
      });
      throw new AiError(
        "aiProviderRejected",
        502,
        providerDetail(error.status, error.message),
      );
    }
    console.error("OpenAI extraction failed", error);
    throw new AiError("aiProviderFailed", 502);
  }
}

/** Reads one finance attachment with the organization's configured AI. */
/** How the consultant's latest posted expense in the category was paid. */
async function latestFunding(
  db: Firestore,
  organizationId: string,
  consultantId: string,
  categoryId: string,
) {
  const snapshot = await db
    .collection("financialTransactions")
    .where("organizationId", "==", organizationId)
    .where("consultantId", "==", consultantId)
    .where("categoryId", "==", categoryId)
    .orderBy("date", "desc")
    .limit(10)
    .get();
  const latest = snapshot.docs
    .map((document) => document.data())
    .find(
      (data) =>
        data.direction === "expense" &&
        data.status === "posted" &&
        !data.reversedByTransactionId &&
        (data.funding === "company" || data.funding === "consultant"),
    );
  return (latest?.funding as "company" | "consultant" | undefined) ?? null;
}

export async function extractFinanceDocument(
  db: Firestore,
  actor: PortalUser,
  file: ExtractionFile,
  purpose: AiExtractionPurpose = "transaction",
): Promise<FinanceExtraction> {
  const { settings, encryptedKeys } = await readAiSettings(
    db,
    actor.organizationId,
  );
  if (!aiFeatureEnabled(settings, AI_PURPOSE_FEATURE[purpose]))
    throw new AiError("aiDisabled", 403);
  const encryptedKey = encryptedKeys[settings.provider];
  if (!encryptedKey) throw new AiError("aiNotConfigured", 400);
  if (
    file.contentType !== "application/pdf" &&
    file.contentType !== "message/rfc822" &&
    !IMAGE_TYPES.includes(file.contentType as ImageType)
  )
    throw new AiError("aiUnsupportedFile", 400);

  const [organization, categorySnapshot, userSnapshot, customerSnapshot] =
    await Promise.all([
      db.collection("organizations").doc(actor.organizationId).get(),
      db
        .collection("financeCategories")
        .where("organizationId", "==", actor.organizationId)
        .get(),
      db
        .collection("users")
        .where("organizationId", "==", actor.organizationId)
        .get(),
      purpose === "invoice"
        ? db
            .collection("financeCustomers")
            .where("organizationId", "==", actor.organizationId)
            .get()
        : null,
    ]);
  const customers = (customerSnapshot?.docs ?? []).map((document) => ({
    id: document.id,
    name: String(document.data().name ?? ""),
  }));
  const consultants = userSnapshot.docs
    .filter((document) => document.data().role === "consultant")
    .map((document) => ({
      id: document.id,
      displayName: String(document.data().displayName ?? ""),
    }))
    .filter((consultant) => consultant.displayName.trim());
  const categories = categorySnapshot.docs
    .filter((document) => document.data().active !== false)
    .map((document) => {
      const name = document.data().name as { en?: string; sv?: string };
      return {
        id: document.id,
        direction: String(document.data().direction),
        name: [name?.en, name?.sv].filter(Boolean).join(" / "),
      };
    });
  const system = instructions({
    organizationName: String(organization.data()?.name ?? "Debageri"),
    purpose,
    categories: purpose === "invoice" ? [] : categories,
    consultants,
    customers,
  });
  const apiKey = decryptPassword(encryptedKey);
  const output =
    settings.provider === "anthropic"
      ? await callAnthropic(apiKey, settings.model, file, system)
      : await callOpenAi(apiKey, settings.model, file, system);

  let parsed: z.infer<typeof rawExtractionSchema>;
  try {
    parsed = rawExtractionSchema.parse(JSON.parse(output));
  } catch {
    throw new AiError("aiNoResult", 422);
  }
  const extraction = normalizeFinanceExtraction(
    parsed,
    categories.map((category) => category.id),
    consultants.map((consultant) => consultant.id),
    customers.map((customer) => customer.id),
  );
  extraction.consultantId =
    matchConsultantByName(file.name, consultants) ?? extraction.consultantId;
  const category = categories.find((item) => item.id === extraction.categoryId);
  if (extraction.consultantId && category?.direction === "expense")
    // A suggestion only; never fail the reading over it.
    extraction.funding = await latestFunding(
      db,
      actor.organizationId,
      extraction.consultantId,
      category.id,
    ).catch((error: unknown) => {
      console.warn("Previous funding lookup failed", { error });
      return null;
    });
  if (extraction.currency === "SEK") return extraction;
  const rate = await sekExchangeRate(
    extraction.currency,
    extraction.date ?? new Date().toISOString().slice(0, 10),
  );
  return rate ? convertExtractionToSek(extraction, rate) : extraction;
}
