/**
 * Company equipment: what the company owns, who holds it, what it cost, and
 * the receipts people accept when equipment is handed to them. Pure rules
 * only, so they can be tested without Firebase.
 */

export const ASSET_CATEGORIES = [
  "phone",
  "computer",
  "monitor",
  "storage",
  "accessory",
  "furniture",
  "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** Active equipment is in use or in stock; the others have left the company. */
export const ASSET_STATUSES = ["active", "sold", "disposed", "lost"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** How equipment leaves the company other than by being sold. */
export const ASSET_RETIRE_STATUSES = ["disposed", "lost"] as const;
export type AssetRetireStatus = (typeof ASSET_RETIRE_STATUSES)[number];

/** A portal user, the company itself (an office or store), or anyone else. */
export const ASSET_HOLDER_TYPES = ["user", "company", "external"] as const;
export type AssetHolderType = (typeof ASSET_HOLDER_TYPES)[number];

export const HANDOVER_STATUSES = [
  "pending",
  "accepted",
  "cancelled",
  "returned",
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

/** A sale is to a portal user or to someone outside the portal. */
export const ASSET_BUYER_TYPES = ["user", "external"] as const;
export type AssetBuyerType = (typeof ASSET_BUYER_TYPES)[number];

export const ASSET_LINKS = ["purchase", "sale"] as const;
export type AssetLink = (typeof ASSET_LINKS)[number];

export const ASSET_MAX_FILES = 10;
export const ASSET_MAX_BYTES = 20 * 1024 * 1024;
export const ASSET_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** The receipt's terms, in order, as locale keys. */
/** How the recipient signs a receipt: drawn by hand or typed in a script. */
export const SIGNATURE_METHODS = ["drawn", "typed"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];
export const SIGNATURE_MAX_WIDTH = 1200;
export const SIGNATURE_MAX_HEIGHT = 400;
/** The PNG sent as a data URL, base64 included. */
export const SIGNATURE_MAX_DATA_URL = 400_000;
export const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,";

/** Enough ink to be a mark rather than a stray click: some covered pixels. */
export function hasSignatureInk(alpha: Iterable<number>, minimumPixels = 40) {
  let inked = 0;
  for (const value of alpha)
    if (value > 96 && ++inked >= minimumPixels) return true;
  return false;
}

export const ASSET_TERM_KEYS = [
  "assetTerms_1",
  "assetTerms_2",
  "assetTerms_3",
  "assetTerms_4",
  "assetTerms_5",
] as const;

export type AssetHolder = {
  type: AssetHolderType;
  /** Set for a portal user. */
  userId: string | null;
  /** The person's name, or empty for the company. */
  name: string;
  /** Where the equipment is kept, such as an office. */
  location: string;
};

export const COMPANY_HOLDER: AssetHolder = {
  type: "company",
  userId: null,
  name: "",
  location: "",
};

export type AssetSale = {
  date: string;
  priceMinor: number;
  buyerType: AssetBuyerType;
  buyerUserId: string | null;
  buyerName: string;
};

export type AssetRetirement = {
  date: string;
  note: string;
};

/** The facts the rules below look at. */
export type AssetState = {
  status: AssetStatus;
  activeHandoverId: string | null;
  handoverStatus: HandoverStatus | null;
  purchasePriceMinor: number;
  purchaseTransactionId: string | null;
  sale: AssetSale | null;
  saleTransactionId: string | null;
};

/**
 * One thing an asset is made of, such as a tablet and its pen bought
 * together. Each has its own row on the receipt and its own price.
 */
export type AssetPart = {
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  accessories: string;
  /** Including VAT. */
  priceMinor: number;
};

export const ASSET_MAX_PARTS = 20;

/**
 * The parts of a stored asset. Assets saved before parts existed describe
 * one thing with fields of their own, which become its only part.
 */
export function assetPartsFrom(data: Record<string, unknown>): AssetPart[] {
  if (Array.isArray(data.parts) && data.parts.length)
    return data.parts
      .filter(
        (part): part is Record<string, unknown> =>
          Boolean(part) && typeof part === "object",
      )
      .map((part) => ({
        name: String(part.name ?? ""),
        make: String(part.make ?? ""),
        model: String(part.model ?? ""),
        serialNumber: String(part.serialNumber ?? ""),
        accessories: String(part.accessories ?? ""),
        priceMinor: Number(part.priceMinor ?? 0),
      }));
  return [
    {
      name: String(data.name ?? ""),
      make: String(data.make ?? ""),
      model: String(data.model ?? ""),
      serialNumber: String(data.serialNumber ?? ""),
      accessories: String(data.accessories ?? ""),
      priceMinor: Math.max(
        0,
        Number(data.purchasePriceMinor ?? 0) -
          Number(data.otherCostsMinor ?? 0),
      ),
    },
  ];
}

/** What the asset cost: its parts plus shipping, fees and the like. */
export const assetPriceMinor = (
  parts: readonly Pick<AssetPart, "priceMinor">[],
  otherCostsMinor: number,
) => parts.reduce((sum, part) => sum + part.priceMinor, 0) + otherCostsMinor;

/** "Apple iPad Pro" for the first part, with how many more there are. */
export function partsSummary(parts: readonly AssetPart[]) {
  const first = parts[0];
  return {
    makeModel: first ? [first.make, first.model].filter(Boolean).join(" ") : "",
    serialNumber: first?.serialNumber ?? "",
    more: Math.max(0, parts.length - 1),
  };
}

export type HandoverLine = {
  assetId: string;
  equipment: string;
  makeModel: string;
  serialNumber: string;
  accessories: string;
  /** Who held it before the handover, to restore when it is cancelled. */
  previousHolder: AssetHolder;
};

const includes = <T extends string>(list: readonly T[], value: unknown) =>
  (list as readonly unknown[]).includes(value);

export const isAssetCategory = (value: unknown): value is AssetCategory =>
  includes(ASSET_CATEGORIES, value);
export const isAssetStatus = (value: unknown): value is AssetStatus =>
  includes(ASSET_STATUSES, value);
export const isHandoverStatus = (value: unknown): value is HandoverStatus =>
  includes(HANDOVER_STATUSES, value);
export const isAssetHolderType = (value: unknown): value is AssetHolderType =>
  includes(ASSET_HOLDER_TYPES, value);
export const isAssetContentType = (type: string) =>
  includes(ASSET_CONTENT_TYPES, type);

/** Reads a stored holder, falling back to the company. */
export function assetHolderFrom(value: unknown): AssetHolder {
  if (!value || typeof value !== "object") return { ...COMPANY_HOLDER };
  const data = value as Record<string, unknown>;
  const type = isAssetHolderType(data.type) ? data.type : "company";
  return {
    type,
    userId: type === "user" && data.userId ? String(data.userId) : null,
    name: type === "company" ? "" : String(data.name ?? ""),
    location: String(data.location ?? ""),
  };
}

export function assetSaleFrom(value: unknown): AssetSale | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const buyerType = data.buyerType === "user" ? "user" : "external";
  return {
    date: String(data.date ?? ""),
    priceMinor: Number(data.priceMinor ?? 0),
    buyerType,
    buyerUserId:
      buyerType === "user" && data.buyerUserId
        ? String(data.buyerUserId)
        : null,
    buyerName: String(data.buyerName ?? ""),
  };
}

/** Equipment that is still the company's and not tied up in a handover. */
const free = (asset: AssetState) =>
  asset.status === "active" && !asset.activeHandoverId;

/** A receipt can only be issued for equipment nobody has been handed. */
export const canIssueHandover = (asset: AssetState) => free(asset);

/**
 * Moving equipment to the office or someone outside the portal. Equipment
 * handed to someone is first returned, so the receipt is closed properly.
 */
export const canChangeHolder = (asset: AssetState) => free(asset);

/** Selling is allowed while nobody is still asked to accept it. */
export const canSell = (asset: AssetState) =>
  asset.status === "active" && asset.handoverStatus !== "pending";

export const canRetire = canSell;

/**
 * Removing an asset, for example one added by mistake. Not while someone is
 * asked to accept it or holds it on a receipt: that is closed first.
 */
export const canDeleteAsset = (asset: Pick<AssetState, "activeHandoverId">) =>
  !asset.activeHandoverId;

/** Edits are allowed until the equipment has left the company. */
export const canEditAsset = (asset: Pick<AssetState, "status">) =>
  asset.status === "active";

export const canAcceptHandover = (
  handover: { status: HandoverStatus; recipientUserId: string },
  userId: string,
) => handover.status === "pending" && handover.recipientUserId === userId;

export const canCancelHandover = (handover: { status: HandoverStatus }) =>
  handover.status === "pending";

export const canReturnHandover = (handover: { status: HandoverStatus }) =>
  handover.status === "accepted";

/** Whether the purchase or sale can still become a finance transaction. */
export function canLinkTransaction(asset: AssetState, link: AssetLink) {
  if (link === "purchase")
    return asset.purchasePriceMinor > 0 && !asset.purchaseTransactionId;
  return (
    asset.status === "sold" &&
    asset.sale !== null &&
    asset.sale.priceMinor > 0 &&
    !asset.saleTransactionId
  );
}

/** The receipt rows for an asset: one for each of its parts. */
export function handoverLines(asset: {
  id: string;
  name: string;
  parts: readonly AssetPart[];
  holder: AssetHolder;
}): HandoverLine[] {
  return asset.parts.map((part) => ({
    assetId: asset.id,
    equipment: part.name || asset.name,
    makeModel: [part.make, part.model].filter(Boolean).join(" "),
    serialNumber: part.serialNumber,
    accessories: part.accessories,
    previousHolder: asset.holder,
  }));
}

export type AssetFilter = {
  status: AssetStatus | "all";
  category: AssetCategory | "all";
  /** A holder type, or `user:{id}` for one person. */
  holder: string;
  search: string;
};

export function filterAssets<
  T extends {
    status: AssetStatus;
    category: AssetCategory;
    holder: AssetHolder;
    name: string;
    parts: readonly AssetPart[];
  },
>(assets: readonly T[], filter: AssetFilter) {
  const words = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return assets.filter((asset) => {
    if (filter.status !== "all" && asset.status !== filter.status) return false;
    if (filter.category !== "all" && asset.category !== filter.category)
      return false;
    if (filter.holder.startsWith("user:")) {
      if (asset.holder.userId !== filter.holder.slice(5)) return false;
    } else if (filter.holder !== "all" && asset.holder.type !== filter.holder)
      return false;
    const text = [
      asset.name,
      ...asset.parts.flatMap((part) => [
        part.name,
        part.make,
        part.model,
        part.serialNumber,
      ]),
      asset.holder.name,
      asset.holder.location,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** What the company paid for the equipment it still owns. */
export const activePurchaseValueMinor = (
  assets: readonly { status: AssetStatus; purchasePriceMinor: number }[],
) =>
  assets
    .filter((asset) => asset.status === "active")
    .reduce((sum, asset) => sum + asset.purchasePriceMinor, 0);

/** Expense categories that buy an asset, matched on code or name. */
export const ASSET_EXPENSE_CATEGORY_WORDS = ["equipment", "utrustning"];

export function isAssetExpenseCategory(
  category:
    | {
        code: string;
        name: { en: string; sv: string };
        direction: "income" | "expense";
      }
    | undefined,
) {
  if (!category || category.direction !== "expense") return false;
  return [category.code, category.name.en, category.name.sv]
    .map((text) =>
      String(text ?? "")
        .trim()
        .toLowerCase(),
    )
    .some((text) =>
      ASSET_EXPENSE_CATEGORY_WORDS.some(
        (word) => text === word || text.split(/[^\p{L}]+/u).includes(word),
      ),
    );
}
