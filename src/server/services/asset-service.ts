import "server-only";

import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { can } from "@/domain/access/permissions";
import {
  ASSET_MAX_BYTES,
  ASSET_MAX_FILES,
  ASSET_TERM_KEYS,
  assetHolderFrom,
  assetSaleFrom,
  canAcceptHandover,
  canCancelHandover,
  canChangeHolder,
  canEditAsset,
  canIssueHandover,
  canLinkTransaction,
  canRetire,
  canReturnHandover,
  canSell,
  COMPANY_HOLDER,
  handoverLine,
  hasSignatureInk,
  isAssetContentType,
  isAssetStatus,
  isHandoverStatus,
  SIGNATURE_DATA_URL_PREFIX,
  SIGNATURE_MAX_HEIGHT,
  SIGNATURE_MAX_WIDTH,
  type AssetHolder,
  type AssetLink,
  type AssetState,
  type HandoverLine,
  type SignatureMethod,
} from "@/domain/assets";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import type { PortalUser } from "@/domain/types";
import { isLocale, type Locale } from "@/lib/localization/locale";
import { translate } from "@/lib/localization/messages";
import { permissionResolver } from "@/server/auth/permissions";
import {
  assetReceiptPdf,
  type AssetReceiptPdfLabels,
} from "@/server/export/asset-receipt-pdf";
import type { PdfImage } from "@/server/export/pdf-document";
import { pngAlpha } from "@/server/export/png";
import { loadPayrollProfile } from "@/server/services/payroll-service";
import type {
  AssetActionInput,
  AssetFormInput,
  HandoverIssueInput,
} from "@/server/validators/assets";

export class AssetError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export type StoredAssetFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
};

export const canViewAssets = (actor: PortalUser) => can(actor, "assets.view");
export const canManageAssets = (actor: PortalUser) =>
  can(actor, "assets.manage");
export const canViewOwnAssets = (actor: PortalUser) => can(actor, "my.assets");
export const canUseAssets = (actor: PortalUser) =>
  canViewAssets(actor) || canViewOwnAssets(actor);

export function assetVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canViewAssets(actor)) return true;
  return (
    canViewOwnAssets(actor) && assetHolderFrom(data.holder).userId === actor.id
  );
}

/** The recipient can always open their own receipt, to accept it. */
export function handoverVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  return canViewAssets(actor) || data.recipientUserId === actor.id;
}

export function storedAssetFiles(value: unknown): StoredAssetFile[] {
  return Array.isArray(value)
    ? value
        .filter(
          (file): file is Record<string, unknown> =>
            Boolean(file) && typeof file === "object",
        )
        .map((file) => ({
          id: String(file.id),
          name: String(file.name),
          contentType: String(file.contentType),
          size: Number(file.size ?? 0),
          storagePath: String(file.storagePath),
        }))
    : [];
}

export function assetStateFrom(
  data: FirebaseFirestore.DocumentData,
): AssetState {
  return {
    status: isAssetStatus(data.status) ? data.status : "active",
    activeHandoverId: data.activeHandoverId
      ? String(data.activeHandoverId)
      : null,
    handoverStatus: isHandoverStatus(data.handoverStatus)
      ? data.handoverStatus
      : null,
    purchasePriceMinor: Number(data.purchasePriceMinor ?? 0),
    purchaseTransactionId: data.purchaseTransactionId
      ? String(data.purchaseTransactionId)
      : null,
    sale: assetSaleFrom(data.sale),
    saleTransactionId: data.saleTransactionId
      ? String(data.saleTransactionId)
      : null,
  };
}

export function handoverLinesFrom(value: unknown): HandoverLine[] {
  return Array.isArray(value)
    ? value
        .filter(
          (line): line is Record<string, unknown> =>
            Boolean(line) && typeof line === "object",
        )
        .map((line) => ({
          assetId: String(line.assetId),
          equipment: String(line.equipment ?? ""),
          makeModel: String(line.makeModel ?? ""),
          serialNumber: String(line.serialNumber ?? ""),
          accessories: String(line.accessories ?? ""),
          previousHolder: assetHolderFrom(line.previousHolder),
        }))
    : [];
}

export const stockholmToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );

/** `2026-08-21 14:05` in Stockholm time. */
export function stockholmDateTime(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function auditEntry(
  actor: PortalUser,
  action: string,
  entityType: "asset" | "assetHandover",
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType,
    entityId,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  };
}

type EventKind =
  | "created"
  | "edited"
  | "holderChanged"
  | "handoverIssued"
  | "handoverCancelled"
  | "handoverAccepted"
  | "returned"
  | "sold"
  | "disposed"
  | "lost"
  | "purchaseBooked"
  | "saleBooked";

function addEvent(
  db: Firestore,
  write: {
    create: (ref: FirebaseFirestore.DocumentReference, data: object) => unknown;
  },
  actor: PortalUser,
  assetId: string,
  kind: EventKind,
  extra: {
    holder?: AssetHolder;
    note?: string;
    handoverId?: string | null;
  } = {},
) {
  write.create(db.collection("assetEvents").doc(), {
    organizationId: actor.organizationId,
    assetId,
    kind,
    holder: extra.holder ?? null,
    note: extra.note ?? "",
    handoverId: extra.handoverId ?? null,
    performedBy: actor.id,
    performedByName: actor.displayName,
    performedAt: FieldValue.serverTimestamp(),
  });
}

function checkFiles(files: File[]) {
  for (const file of files) {
    if (file.size === 0) throw new AssetError("assetFileEmpty");
    if (file.size > ASSET_MAX_BYTES) throw new AssetError("assetFileTooLarge");
    if (!isAssetContentType(file.type)) throw new AssetError("assetFileType");
  }
}

async function uploadFiles(
  storage: Storage,
  actor: PortalUser,
  folder: string,
  files: File[],
) {
  const uploaded: StoredAssetFile[] = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const storagePath = `organizations/${actor.organizationId}/assets/${folder}/${id}`;
      await storage
        .bucket()
        .file(storagePath)
        .save(Buffer.from(await file.arrayBuffer()), {
          resumable: false,
          metadata: {
            contentType: file.type,
            cacheControl: "private, no-cache",
          },
        });
      uploaded.push({
        id,
        name: file.name.replace(/[\r\n]/g, "").slice(0, 180) || "attachment",
        contentType: file.type,
        size: file.size,
        storagePath,
      });
    }
  } catch (error) {
    await removeFiles(storage, uploaded);
    throw error;
  }
  return uploaded;
}

async function removeFiles(storage: Storage, files: { storagePath: string }[]) {
  await Promise.all(
    files.map((file) =>
      storage
        .bucket()
        .file(file.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined),
    ),
  );
}

function assetFields(input: AssetFormInput) {
  return {
    name: input.name,
    category: input.category,
    make: input.make,
    model: input.model,
    serialNumber: input.serialNumber,
    accessories: input.accessories,
    supplier: input.supplier,
    purchaseDate: input.purchaseDate,
    purchasePriceMinor: input.purchasePriceMinor,
    vatRateBps: input.vatRateBps,
    notes: input.notes,
  };
}

/**
 * An expense an asset can be created from: a posted company expense in this
 * organization that no asset is linked to yet, with its attached files.
 */
export async function assetSourceTransaction(
  db: Firestore,
  actor: PortalUser,
  transactionId: string,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  const [snapshot, linked, attachments] = await Promise.all([
    db.collection("financialTransactions").doc(transactionId).get(),
    db
      .collection("assets")
      .where("organizationId", "==", actor.organizationId)
      .where("purchaseTransactionId", "==", transactionId)
      .limit(1)
      .get(),
    db
      .collection("financeAttachments")
      .where("organizationId", "==", actor.organizationId)
      .where("entityType", "==", "transaction")
      .where("entityId", "==", transactionId)
      .get(),
  ]);
  const data = snapshot.data();
  if (
    !data ||
    data.organizationId !== actor.organizationId ||
    data.direction !== "expense" ||
    data.status !== "posted"
  )
    throw new AssetError("invalidTransaction", 409);
  if (!linked.empty) throw new AssetError("transactionLinked", 409);
  return {
    id: snapshot.id,
    date: String(data.date ?? ""),
    grossMinor: Number(data.grossMinor ?? 0),
    vatRateBps: Number(data.vatRateBps ?? 2_500),
    description: String(data.visibleDescription || data.internalNote || ""),
    files: attachments.docs
      .map((doc) => ({
        id: doc.id,
        name: String(doc.data().name),
        contentType: String(doc.data().contentType),
        size: Number(doc.data().size ?? 0),
        storagePath: String(doc.data().storagePath),
      }))
      .filter((file) => isAssetContentType(file.contentType)),
  };
}

/** Copies an expense's files to the asset, as its own documents. */
async function copyFiles(
  storage: Storage,
  actor: PortalUser,
  assetId: string,
  files: StoredAssetFile[],
) {
  const copied: StoredAssetFile[] = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const storagePath = `organizations/${actor.organizationId}/assets/${assetId}/${id}`;
      await storage
        .bucket()
        .file(file.storagePath)
        .copy(storage.bucket().file(storagePath));
      copied.push({ ...file, id, storagePath });
    }
  } catch (error) {
    await removeFiles(storage, copied);
    throw error;
  }
  return copied;
}

/**
 * Registers an asset with the company. When someone is chosen to use it, a
 * receipt is issued for them to accept, and its id is returned too.
 */
export async function createAsset(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: AssetFormInput,
  files: File[],
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  checkFiles(files);
  if (
    input.inUseBy &&
    !(await handoverRecipients(db, actor.organizationId)).some(
      (person) => person.id === input.inUseBy,
    )
  )
    throw new AssetError("invalidRecipient");
  const source = input.purchaseTransactionId
    ? await assetSourceTransaction(db, actor, input.purchaseTransactionId)
    : null;
  const fromExpense = (source?.files ?? []).slice(0, ASSET_MAX_FILES);
  if (fromExpense.length + files.length > ASSET_MAX_FILES)
    throw new AssetError("assetTooManyFiles");
  const ref = db.collection("assets").doc();
  const uploaded = [
    ...(await copyFiles(storage, actor, ref.id, fromExpense)),
    ...(await uploadFiles(storage, actor, ref.id, files)),
  ];
  const holder: AssetHolder = { ...COMPANY_HOLDER };
  try {
    await db.runTransaction(async (transaction) => {
      if (source) {
        const linked = await transaction.get(
          db
            .collection("assets")
            .where("organizationId", "==", actor.organizationId)
            .where("purchaseTransactionId", "==", source.id)
            .limit(1),
        );
        if (!linked.empty) throw new AssetError("transactionLinked", 409);
      }
      transaction.create(ref, {
        organizationId: actor.organizationId,
        ...assetFields(input),
        files: uploaded,
        status: "active",
        holder,
        activeHandoverId: null,
        handoverStatus: null,
        purchaseTransactionId: source?.id ?? null,
        sale: null,
        saleTransactionId: null,
        retirement: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, ref.id, "created", { holder });
      if (source) addEvent(db, transaction, actor, ref.id, "purchaseBooked");
      transaction.create(
        db.collection("auditLogs").doc(),
        auditEntry(actor, "asset.created", "asset", ref.id, {
          name: input.name,
          purchaseTransactionId: source?.id ?? null,
        }),
      );
    });
  } catch (error) {
    await removeFiles(storage, uploaded);
    throw error;
  }
  const handoverId = input.inUseBy
    ? await issueHandover(db, actor, {
        recipientUserId: input.inUseBy,
        assetIds: [ref.id],
        includePersonalNumber: false,
      })
    : null;
  return { id: ref.id, handoverId };
}

export async function updateAsset(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  assetId: string,
  input: AssetFormInput,
  files: File[],
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  checkFiles(files);
  const ref = db.collection("assets").doc(assetId);
  const before = await ref.get();
  const current = before.data();
  if (!before.exists || current?.organizationId !== actor.organizationId)
    throw new AssetError("notFound", 404);
  const existing = storedAssetFiles(current.files);
  const kept = existing.filter((file) => input.keepFileIds.includes(file.id));
  if (kept.length + files.length > ASSET_MAX_FILES)
    throw new AssetError("assetTooManyFiles");
  const uploaded = await uploadFiles(storage, actor, assetId, files);
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!data) throw new AssetError("notFound", 404);
      if (!canEditAsset(assetStateFrom(data)))
        throw new AssetError("assetNotActive", 409);
      const latest = storedAssetFiles(data.files).filter((file) =>
        input.keepFileIds.includes(file.id),
      );
      transaction.update(ref, {
        ...assetFields(input),
        files: [...latest, ...uploaded],
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, assetId, "edited");
      transaction.create(
        db.collection("auditLogs").doc(),
        auditEntry(actor, "asset.updated", "asset", assetId, {
          name: input.name,
        }),
      );
    });
  } catch (error) {
    await removeFiles(storage, uploaded);
    throw error;
  }
  await removeFiles(
    storage,
    existing.filter((file) => !input.keepFileIds.includes(file.id)),
  );
}

/** Loads a user of the organization, or throws `code`. */
async function orgUser(
  db: Firestore,
  actor: PortalUser,
  userId: string,
  code: string,
) {
  const snapshot = await db.collection("users").doc(userId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new AssetError(code);
  return data;
}

/** Moves equipment to the office or someone outside, sells or retires it. */
export async function changeAsset(
  db: Firestore,
  actor: PortalUser,
  assetId: string,
  input: AssetActionInput,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  let buyerName = input.action === "sell" ? input.buyerName : "";
  if (input.action === "sell" && input.buyerType === "user")
    buyerName = String(
      (await orgUser(db, actor, input.buyerUserId!, "invalidBuyer"))
        .displayName,
    );
  const ref = db.collection("assets").doc(assetId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.organizationId !== actor.organizationId)
      throw new AssetError("notFound", 404);
    const state = assetStateFrom(data);
    if (input.action === "holder") {
      if (!canChangeHolder(state))
        throw new AssetError(
          state.activeHandoverId ? "handoverOpen" : "assetNotActive",
          409,
        );
      const holder: AssetHolder = {
        type: input.type,
        userId: null,
        name: input.type === "external" ? input.name : "",
        location: input.location,
      };
      transaction.update(ref, {
        holder,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, assetId, "holderChanged", {
        holder,
        note: input.note,
      });
      transaction.create(
        db.collection("auditLogs").doc(),
        auditEntry(actor, "asset.holderChanged", "asset", assetId, {
          holderType: holder.type,
          holderName: holder.name,
        }),
      );
      return;
    }
    if (input.action === "sell") {
      if (!canSell(state))
        throw new AssetError(
          state.handoverStatus === "pending"
            ? "handoverPending"
            : "assetNotActive",
          409,
        );
      const sale = {
        date: input.date,
        priceMinor: input.priceMinor,
        buyerType: input.buyerType,
        buyerUserId: input.buyerType === "user" ? input.buyerUserId : null,
        buyerName,
      };
      const holder: AssetHolder = {
        type: input.buyerType,
        userId: sale.buyerUserId,
        name: buyerName,
        location: "",
      };
      transaction.update(ref, {
        status: "sold",
        sale,
        holder,
        activeHandoverId: null,
        handoverStatus: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, assetId, "sold", {
        holder,
        note: input.note,
      });
      transaction.create(
        db.collection("auditLogs").doc(),
        auditEntry(actor, "asset.sold", "asset", assetId, {
          priceMinor: input.priceMinor,
          buyerName,
        }),
      );
      return;
    }
    if (!canRetire(state))
      throw new AssetError(
        state.handoverStatus === "pending"
          ? "handoverPending"
          : "assetNotActive",
        409,
      );
    transaction.update(ref, {
      status: input.status,
      retirement: { date: input.date, note: input.note },
      activeHandoverId: null,
      handoverStatus: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    addEvent(db, transaction, actor, assetId, input.status, {
      note: input.note,
    });
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, `asset.${input.status}`, "asset", assetId, {
        date: input.date,
      }),
    );
  });
}

/** People who can open their own equipment page and so accept a receipt. */
export async function handoverRecipients(
  db: Firestore,
  organizationId: string,
) {
  const [snapshot, permissionsFor] = await Promise.all([
    db.collection("users").where("organizationId", "==", organizationId).get(),
    permissionResolver(db, organizationId),
  ]);
  return snapshot.docs
    .filter((doc) => {
      const data = doc.data();
      if (data.status !== "active") return false;
      const permissions = permissionsFor({
        role: String(data.role),
        organizationId: String(data.organizationId),
        accessProfileId: data.accessProfileId,
      });
      return (
        permissions.includes("my.assets") || permissions.includes("assets.view")
      );
    })
    .map((doc) => ({ id: doc.id, name: String(doc.data().displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Hands equipment to a person: the receipt waits for them to accept it,
 * and the equipment is theirs to hold from now on.
 */
export async function issueHandover(
  db: Firestore,
  actor: PortalUser,
  input: HandoverIssueInput,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  const recipients = await handoverRecipients(db, actor.organizationId);
  const recipient = recipients.find(
    (person) => person.id === input.recipientUserId,
  );
  if (!recipient) throw new AssetError("invalidRecipient");
  const organization = await db
    .collection("organizations")
    .doc(actor.organizationId)
    .get();
  const invoicing = invoiceSettingsFrom(
    organization.data()?.invoicing,
    String(organization.data()?.name ?? ""),
  );
  const ref = db.collection("assetHandovers").doc();
  const holder: AssetHolder = {
    type: "user",
    userId: recipient.id,
    name: recipient.name,
    location: "",
  };
  await db.runTransaction(async (transaction) => {
    const refs = input.assetIds.map((id) => db.collection("assets").doc(id));
    const snapshots = await Promise.all(
      refs.map((item) => transaction.get(item)),
    );
    const lines = snapshots.map((snapshot) => {
      const data = snapshot.data();
      if (!data || data.organizationId !== actor.organizationId)
        throw new AssetError("notFound", 404);
      if (!canIssueHandover(assetStateFrom(data)))
        throw new AssetError("assetNotAvailable", 409);
      return handoverLine({
        id: snapshot.id,
        name: String(data.name),
        make: String(data.make ?? ""),
        model: String(data.model ?? ""),
        serialNumber: String(data.serialNumber ?? ""),
        accessories: String(data.accessories ?? ""),
        holder: assetHolderFrom(data.holder),
      });
    });
    transaction.create(ref, {
      organizationId: actor.organizationId,
      recipientUserId: recipient.id,
      recipientName: recipient.name,
      assetIds: input.assetIds,
      lines,
      company: {
        legalName: invoicing.legalName,
        orgNumber: invoicing.orgNumber,
      },
      includePersonalNumber: input.includePersonalNumber,
      status: "pending",
      issuedOn: stockholmToday(),
      issuedAt: FieldValue.serverTimestamp(),
      issuedBy: actor.id,
      issuedByName: actor.displayName,
      acceptedAt: null,
      acceptedOn: null,
      acceptedPlace: "",
      locale: null,
      pdfStoragePath: null,
      scan: null,
      closedAt: null,
      closedBy: null,
    });
    for (const assetRef of refs) {
      transaction.update(assetRef, {
        holder,
        activeHandoverId: ref.id,
        handoverStatus: "pending",
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, assetRef.id, "handoverIssued", {
        holder,
        handoverId: ref.id,
      });
    }
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "assetHandover.issued", "assetHandover", ref.id, {
        recipientUserId: recipient.id,
        assetIds: input.assetIds,
      }),
    );
  });
  return ref.id;
}

/** Updates the assets still tied to a handover, inside its transaction. */
async function tiedAssets(
  db: Firestore,
  transaction: Transaction,
  handoverId: string,
  lines: HandoverLine[],
) {
  const snapshots = await Promise.all(
    lines.map((line) =>
      transaction.get(db.collection("assets").doc(line.assetId)),
    ),
  );
  return snapshots
    .map((snapshot, index) => ({ snapshot, line: lines[index]! }))
    .filter(({ snapshot }) => snapshot.data()?.activeHandoverId === handoverId);
}

export async function cancelHandover(
  db: Firestore,
  actor: PortalUser,
  handoverId: string,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  const ref = db.collection("assetHandovers").doc(handoverId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.organizationId !== actor.organizationId)
      throw new AssetError("notFound", 404);
    if (
      !canCancelHandover({
        status: isHandoverStatus(data.status) ? data.status : "cancelled",
      })
    )
      throw new AssetError("invalidTransition", 409);
    const assets = await tiedAssets(
      db,
      transaction,
      handoverId,
      handoverLinesFrom(data.lines),
    );
    transaction.update(ref, {
      status: "cancelled",
      closedAt: FieldValue.serverTimestamp(),
      closedBy: actor.id,
    });
    for (const { snapshot: asset, line } of assets) {
      transaction.update(asset.ref, {
        holder: line.previousHolder,
        activeHandoverId: null,
        handoverStatus: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, asset.id, "handoverCancelled", {
        holder: line.previousHolder,
        handoverId,
      });
    }
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "assetHandover.cancelled", "assetHandover", handoverId),
    );
  });
}

/** The equipment comes back to the company, at `location`. */
export async function returnHandover(
  db: Firestore,
  actor: PortalUser,
  handoverId: string,
  location: string,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  const ref = db.collection("assetHandovers").doc(handoverId);
  const holder: AssetHolder = { ...COMPANY_HOLDER, location };
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.organizationId !== actor.organizationId)
      throw new AssetError("notFound", 404);
    if (
      !canReturnHandover({
        status: isHandoverStatus(data.status) ? data.status : "cancelled",
      })
    )
      throw new AssetError("invalidTransition", 409);
    const assets = await tiedAssets(
      db,
      transaction,
      handoverId,
      handoverLinesFrom(data.lines),
    );
    transaction.update(ref, {
      status: "returned",
      closedAt: FieldValue.serverTimestamp(),
      closedBy: actor.id,
    });
    for (const { snapshot: asset } of assets) {
      transaction.update(asset.ref, {
        holder,
        activeHandoverId: null,
        handoverStatus: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, asset.id, "returned", {
        holder,
        handoverId,
      });
    }
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "assetHandover.returned", "assetHandover", handoverId),
    );
  });
}

function receiptLabels(locale: Locale, signedBy: string, signedAt: string) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return {
    title: t("assetReceiptTitle"),
    company: t("assetReceiptCompany"),
    orgNumber: t("assetReceiptOrgNumber"),
    recipient: t("assetReceiptRecipient"),
    personalNumber: t("assetReceiptPersonalNumber"),
    date: t("date"),
    issuedEquipment: t("assetReceiptIssuedEquipment"),
    equipment: t("assetReceiptEquipment"),
    makeModel: t("assetReceiptMakeModel"),
    serialNumber: t("assetReceiptSerialNumber"),
    accessories: t("assetAccessories"),
    noAccessories: t("assetReceiptNoAccessories"),
    terms: t("assetReceiptTerms"),
    confirmation: t("assetReceiptConfirmation"),
    confirmationText: t("assetReceiptConfirmationText"),
    placeAndDate: t("assetReceiptPlaceAndDate"),
    recipientHeading: t("assetReceiptRecipientHeading"),
    name: t("name"),
    signature: t("assetReceiptSignature"),
    signedElectronically: t("assetReceiptSignedElectronically")
      .replace("{name}", signedBy)
      .replace("{dateTime}", signedAt),
    notYetAccepted: t("assetReceiptNotYetAccepted"),
    termLines: ASSET_TERM_KEYS.map((key) => t(key)),
  } satisfies AssetReceiptPdfLabels;
}

/**
 * The signature the recipient drew or typed, as the browser sent it: a PNG
 * of ink on a transparent background. Blank or malformed images are refused.
 */
export function readSignature(dataUrl: string) {
  if (!dataUrl.startsWith(SIGNATURE_DATA_URL_PREFIX))
    throw new AssetError("invalidSignature", 400);
  const png = Buffer.from(
    dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length),
    "base64",
  );
  let image: PdfImage;
  try {
    image = pngAlpha(png, {
      maxWidth: SIGNATURE_MAX_WIDTH,
      maxHeight: SIGNATURE_MAX_HEIGHT,
    });
  } catch {
    throw new AssetError("invalidSignature", 400);
  }
  if (!hasSignatureInk(image.alpha))
    throw new AssetError("invalidSignature", 400);
  return { png, image };
}

export const handoverSignaturePath = (
  organizationId: string,
  handoverId: string,
) =>
  `organizations/${organizationId}/assets/handovers/${handoverId}/signature.png`;

/** The stored signature of an accepted receipt, or null without one. */
export async function storedSignature(
  storage: Storage,
  data: FirebaseFirestore.DocumentData,
): Promise<PdfImage | null> {
  if (!data.signaturePath) return null;
  try {
    const [png] = await storage
      .bucket()
      .file(String(data.signaturePath))
      .download();
    return pngAlpha(png, {
      maxWidth: SIGNATURE_MAX_WIDTH,
      maxHeight: SIGNATURE_MAX_HEIGHT,
    });
  } catch {
    return null;
  }
}

/** The receipt as a PDF, signed once the recipient has accepted it. */
export async function handoverPdf(
  db: Firestore,
  data: FirebaseFirestore.DocumentData,
  fallbackLocale: Locale,
  signature: PdfImage | null = null,
) {
  const locale = isLocale(data.locale) ? data.locale : fallbackLocale;
  const acceptedAt =
    data.acceptedAt instanceof Timestamp ? data.acceptedAt.toDate() : null;
  const dateTime = acceptedAt ? stockholmDateTime(acceptedAt) : "";
  const recipientName = String(data.recipientName);
  const labels = receiptLabels(locale, recipientName, dateTime);
  const company = {
    legalName: String(data.company?.legalName ?? ""),
    orgNumber: String(data.company?.orgNumber ?? ""),
  };
  labels.termLines = labels.termLines.map((line) =>
    line.replaceAll("{company}", company.legalName),
  );
  labels.confirmationText = labels.confirmationText.replaceAll(
    "{company}",
    company.legalName,
  );
  const personalNumber = data.includePersonalNumber
    ? (
        await loadPayrollProfile(
          db,
          String(data.organizationId),
          String(data.recipientUserId),
        )
      ).personalNumber
    : "";
  return assetReceiptPdf({
    company,
    recipientName,
    personalNumber: personalNumber ?? "",
    issuedOn: String(data.issuedOn ?? ""),
    lines: handoverLinesFrom(data.lines),
    accepted: acceptedAt
      ? {
          place: String(data.acceptedPlace ?? ""),
          date: String(data.acceptedOn ?? ""),
          dateTime,
        }
      : null,
    signature: acceptedAt ? signature : null,
    labels,
  });
}

export const handoverPdfPath = (organizationId: string, handoverId: string) =>
  `organizations/${organizationId}/assets/handovers/${handoverId}/receipt.pdf`;

/**
 * The recipient accepts the receipt. The moment, place and language are
 * recorded, and the signed PDF is stored so it never changes afterwards.
 */
export async function acceptHandover(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  handoverId: string,
  place: string,
  signature: { method: SignatureMethod; image: string },
  locale: Locale,
) {
  const { png, image } = readSignature(signature.image);
  const signaturePath = handoverSignaturePath(actor.organizationId, handoverId);
  const ref = db.collection("assetHandovers").doc(handoverId);
  const acceptedAt = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || !handoverVisible(actor, data))
      throw new AssetError("notFound", 404);
    if (data.recipientUserId !== actor.id)
      throw new AssetError("forbidden", 403);
    if (
      !canAcceptHandover(
        {
          status: isHandoverStatus(data.status) ? data.status : "cancelled",
          recipientUserId: String(data.recipientUserId),
        },
        actor.id,
      )
    )
      throw new AssetError("invalidTransition", 409);
    const assets = await tiedAssets(
      db,
      transaction,
      handoverId,
      handoverLinesFrom(data.lines),
    );
    transaction.update(ref, {
      status: "accepted",
      acceptedAt,
      acceptedOn: stockholmToday(),
      acceptedPlace: place,
      signatureMethod: signature.method,
      signaturePath,
      locale,
    });
    for (const { snapshot: asset } of assets) {
      transaction.update(asset.ref, {
        handoverStatus: "accepted",
        updatedAt: FieldValue.serverTimestamp(),
      });
      addEvent(db, transaction, actor, asset.id, "handoverAccepted", {
        handoverId,
        note: place,
      });
    }
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "assetHandover.accepted", "assetHandover", handoverId, {
        place,
      }),
    );
  });
  // The acceptance stands even if storing the files fails; the PDF is then
  // made from the same recorded facts when someone downloads it.
  try {
    await storage
      .bucket()
      .file(signaturePath)
      .save(png, {
        resumable: false,
        metadata: { contentType: "image/png", cacheControl: "private" },
      });
  } catch (error) {
    console.error("Equipment receipt signature could not be stored", {
      handoverId,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
  }
  try {
    const data = (await ref.get()).data()!;
    const pdf = await handoverPdf(db, data, locale, image);
    const path = handoverPdfPath(actor.organizationId, handoverId);
    await storage
      .bucket()
      .file(path)
      .save(pdf, {
        resumable: false,
        metadata: {
          contentType: "application/pdf",
          cacheControl: "private, no-cache",
        },
      });
    await ref.update({ pdfStoragePath: path });
  } catch (error) {
    console.error("Equipment receipt PDF could not be stored", {
      handoverId,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
  }
}

/** A hand-signed copy of the receipt, scanned, replacing any earlier one. */
export async function uploadHandoverScan(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  handoverId: string,
  file: File,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  checkFiles([file]);
  const ref = db.collection("assetHandovers").doc(handoverId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.organizationId !== actor.organizationId)
    throw new AssetError("notFound", 404);
  if (data.status === "cancelled")
    throw new AssetError("invalidTransition", 409);
  const [uploaded] = await uploadFiles(
    storage,
    actor,
    `handovers/${handoverId}`,
    [file],
  );
  try {
    const batch = db.batch();
    batch.update(ref, { scan: uploaded });
    batch.create(
      db.collection("auditLogs").doc(),
      auditEntry(
        actor,
        "assetHandover.scanUploaded",
        "assetHandover",
        handoverId,
      ),
    );
    await batch.commit();
  } catch (error) {
    await removeFiles(storage, [uploaded!]);
    throw error;
  }
  const previous = storedAssetFiles(data.scan ? [data.scan] : []);
  await removeFiles(storage, previous);
}

/** Loads an asset whose purchase or sale may become a transaction, or throws. */
export async function linkableAsset(
  db: Firestore,
  actor: PortalUser,
  assetId: string,
  link: AssetLink,
) {
  if (!canManageAssets(actor)) throw new AssetError("forbidden", 403);
  const snapshot = await db.collection("assets").doc(assetId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new AssetError("notFound", 404);
  if (!canLinkTransaction(assetStateFrom(data), link))
    throw new AssetError("assetNotLinkable", 409);
  return { ...data, id: snapshot.id } as FirebaseFirestore.DocumentData & {
    id: string;
  };
}

export async function linkAssetTransaction(
  db: Firestore,
  actor: PortalUser,
  assetId: string,
  link: AssetLink,
  transactionId: string,
) {
  const ref = db.collection("assets").doc(assetId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (
      !data ||
      data.organizationId !== actor.organizationId ||
      !canLinkTransaction(assetStateFrom(data), link)
    )
      throw new AssetError("assetNotLinkable", 409);
    transaction.update(ref, {
      [link === "purchase" ? "purchaseTransactionId" : "saleTransactionId"]:
        transactionId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    addEvent(
      db,
      transaction,
      actor,
      assetId,
      link === "purchase" ? "purchaseBooked" : "saleBooked",
    );
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(
        actor,
        link === "purchase" ? "asset.purchaseBooked" : "asset.saleBooked",
        "asset",
        assetId,
        { transactionId },
      ),
    );
  });
}
