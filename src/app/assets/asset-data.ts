import "server-only";

import {
  assetHolderFrom,
  isAssetCategory,
  isHandoverStatus,
} from "@/domain/assets";
import type { PortalUser } from "@/domain/types";
import {
  assetStateFrom,
  canViewAssets,
  handoverLinesFrom,
  storedAssetFiles,
} from "@/server/services/asset-service";
import type { AssetEventItem, AssetItem, HandoverItem } from "./asset-types";

const iso = (value: unknown) =>
  (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ??
  "";

const fileItem = ({
  id,
  name,
  contentType,
  size,
}: {
  id: string;
  name: string;
  contentType: string;
  size: number;
}) => ({ id, name, contentType, size });

/** Internal notes are left out for people who only see their own equipment. */
export function toAssetItem(
  doc: FirebaseFirestore.DocumentSnapshot,
  actor: PortalUser,
): AssetItem | null {
  const data = doc.data();
  if (!data || !isAssetCategory(data.category)) return null;
  const state = assetStateFrom(data);
  const register = canViewAssets(actor);
  return {
    id: doc.id,
    name: String(data.name),
    category: data.category,
    make: String(data.make ?? ""),
    model: String(data.model ?? ""),
    serialNumber: String(data.serialNumber ?? ""),
    accessories: String(data.accessories ?? ""),
    supplier: register ? String(data.supplier ?? "") : "",
    purchaseDate: data.purchaseDate ? String(data.purchaseDate) : null,
    purchasePriceMinor: register ? state.purchasePriceMinor : 0,
    vatRateBps: Number(data.vatRateBps ?? 2_500),
    notes: register ? String(data.notes ?? "") : "",
    files: register ? storedAssetFiles(data.files).map(fileItem) : [],
    status: state.status,
    holder: assetHolderFrom(data.holder),
    activeHandoverId: state.activeHandoverId,
    handoverStatus: state.handoverStatus,
    purchaseTransactionId: register ? state.purchaseTransactionId : null,
    sale: register ? state.sale : null,
    saleTransactionId: register ? state.saleTransactionId : null,
    retirement:
      data.retirement && typeof data.retirement === "object"
        ? {
            date: String(data.retirement.date ?? ""),
            note: String(data.retirement.note ?? ""),
          }
        : null,
    createdAt: iso(data.createdAt),
  };
}

export function toHandoverItem(
  doc: FirebaseFirestore.DocumentSnapshot,
): HandoverItem | null {
  const data = doc.data();
  if (!data) return null;
  const scan = storedAssetFiles(data.scan ? [data.scan] : [])[0];
  return {
    id: doc.id,
    recipientUserId: String(data.recipientUserId),
    recipientName: String(data.recipientName ?? ""),
    lines: handoverLinesFrom(data.lines).map(
      ({ assetId, equipment, makeModel, serialNumber, accessories }) => ({
        assetId,
        equipment,
        makeModel,
        serialNumber,
        accessories,
      }),
    ),
    company: {
      legalName: String(data.company?.legalName ?? ""),
      orgNumber: String(data.company?.orgNumber ?? ""),
    },
    includePersonalNumber: data.includePersonalNumber === true,
    status: isHandoverStatus(data.status) ? data.status : "pending",
    issuedOn: String(data.issuedOn ?? ""),
    issuedByName: String(data.issuedByName ?? ""),
    acceptedOn: data.acceptedOn ? String(data.acceptedOn) : null,
    acceptedAt: iso(data.acceptedAt) || null,
    acceptedPlace: String(data.acceptedPlace ?? ""),
    scan: scan ? fileItem(scan) : null,
  };
}

export function toAssetEvent(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): AssetEventItem {
  const data = doc.data();
  return {
    kind: String(data.kind),
    holder: data.holder ? assetHolderFrom(data.holder) : null,
    note: String(data.note ?? ""),
    handoverId: data.handoverId ? String(data.handoverId) : null,
    performedByName: String(data.performedByName ?? ""),
    performedAt: iso(data.performedAt),
  };
}

export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);
