import type {
  AssetCategory,
  AssetHolder,
  AssetPart,
  AssetRetirement,
  AssetSale,
  AssetStatus,
  HandoverStatus,
} from "@/domain/assets";

export type AssetFileItem = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

export type AssetEventItem = {
  kind: string;
  holder: AssetHolder | null;
  note: string;
  handoverId: string | null;
  performedByName: string;
  performedAt: string;
};

export type AssetItem = {
  id: string;
  name: string;
  category: AssetCategory;
  /** What the asset is made of, each with its own receipt row. */
  parts: AssetPart[];
  /** Shipping, fees and the like, including VAT. */
  otherCostsMinor: number;
  supplier: string;
  purchaseDate: string | null;
  purchasePriceMinor: number;
  vatRateBps: number;
  /** Internal; only sent to people who see the register. */
  notes: string;
  files: AssetFileItem[];
  status: AssetStatus;
  holder: AssetHolder;
  activeHandoverId: string | null;
  handoverStatus: HandoverStatus | null;
  purchaseTransactionId: string | null;
  sale: AssetSale | null;
  saleTransactionId: string | null;
  retirement: AssetRetirement | null;
  createdAt: string;
};

export type HandoverItem = {
  id: string;
  recipientUserId: string;
  recipientName: string;
  lines: {
    assetId: string;
    equipment: string;
    makeModel: string;
    serialNumber: string;
    accessories: string;
  }[];
  company: { legalName: string; orgNumber: string };
  includePersonalNumber: boolean;
  status: HandoverStatus;
  issuedOn: string;
  issuedByName: string;
  acceptedOn: string | null;
  acceptedAt: string | null;
  acceptedPlace: string;
  scan: AssetFileItem | null;
};

export const assetFileUrl = (assetId: string, fileId: string) =>
  `/api/assets/${encodeURIComponent(assetId)}/files/${encodeURIComponent(fileId)}`;

export const handoverPdfUrl = (handoverId: string) =>
  `/api/assets/handovers/${encodeURIComponent(handoverId)}/pdf`;

export const handoverScanUrl = (handoverId: string) =>
  `/api/assets/handovers/${encodeURIComponent(handoverId)}/scan`;
