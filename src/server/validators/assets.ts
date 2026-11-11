import { z } from "zod";
import {
  ASSET_BUYER_TYPES,
  ASSET_CATEGORIES,
  ASSET_RETIRE_STATUSES,
} from "@/domain/assets";
import { REQUEST_VAT_RATES_BPS } from "@/domain/requests";

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().min(1).max(128);
const minor = z.coerce.number().int().min(0).max(10_000_000_000);
const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .transform((value) => value || null);

export const assetFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(ASSET_CATEGORIES),
  make: text(80),
  model: text(120),
  serialNumber: text(120),
  accessories: text(300),
  supplier: text(120),
  purchaseDate: optionalDate,
  /** Including VAT. */
  purchasePriceMinor: minor,
  vatRateBps: z.coerce
    .number()
    .int()
    .refine((value) =>
      (REQUEST_VAT_RATES_BPS as readonly number[]).includes(value),
    ),
  /** Where new equipment is kept; only used when it is created. */
  location: text(120),
  notes: text(2_000),
  /** Ids of files already on the asset that should be kept (edit only). */
  keepFileIds: z.array(z.string().min(1).max(64)).max(20).default([]),
});

export type AssetFormInput = z.infer<typeof assetFormSchema>;

export function parseAssetForm(form: FormData) {
  return assetFormSchema.safeParse({
    name: form.get("name"),
    category: form.get("category"),
    make: form.get("make") ?? "",
    model: form.get("model") ?? "",
    serialNumber: form.get("serialNumber") ?? "",
    accessories: form.get("accessories") ?? "",
    supplier: form.get("supplier") ?? "",
    purchaseDate: form.get("purchaseDate") ?? "",
    purchasePriceMinor: form.get("purchasePriceMinor") ?? 0,
    vatRateBps: form.get("vatRateBps") ?? 2_500,
    location: form.get("location") ?? "",
    notes: form.get("notes") ?? "",
    keepFileIds: form.getAll("keepFileIds").map(String),
  });
}

export const assetHolderSchema = z
  .object({
    action: z.literal("holder"),
    type: z.enum(["company", "external"]),
    name: text(120),
    location: text(120),
    note: text(500),
  })
  .refine((value) => value.type === "company" || value.name.length > 0, {
    message: "Someone outside the portal needs a name",
    path: ["name"],
  });

export const assetSaleSchema = z
  .object({
    action: z.literal("sell"),
    date: z.iso.date(),
    priceMinor: minor,
    buyerType: z.enum(ASSET_BUYER_TYPES),
    buyerUserId: id.nullable().default(null),
    buyerName: text(120),
    note: text(500),
  })
  .refine(
    (value) =>
      value.buyerType === "user"
        ? Boolean(value.buyerUserId)
        : value.buyerName.length > 0,
    { message: "The buyer is missing", path: ["buyerName"] },
  );

export const assetRetireSchema = z.object({
  action: z.literal("retire"),
  status: z.enum(ASSET_RETIRE_STATUSES),
  date: z.iso.date(),
  note: text(500),
});

export const assetActionSchema = z.union([
  assetHolderSchema,
  assetSaleSchema,
  assetRetireSchema,
]);
export type AssetActionInput = z.infer<typeof assetActionSchema>;

export const handoverIssueSchema = z.object({
  recipientUserId: id,
  assetIds: z
    .array(id)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  includePersonalNumber: z.boolean().default(false),
});
export type HandoverIssueInput = z.infer<typeof handoverIssueSchema>;

export const handoverActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    place: z.string().trim().min(1).max(80),
    /** The recipient ticked that they received the equipment. */
    confirm: z.literal(true),
  }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("return"), location: text(120) }),
]);
export type HandoverActionInput = z.infer<typeof handoverActionSchema>;
