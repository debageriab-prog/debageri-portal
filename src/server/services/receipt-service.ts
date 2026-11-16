import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { reachesUser, type Reach } from "@/domain/access/groups";
import { can } from "@/domain/access/permissions";
import type { PortalUser } from "@/domain/types";
import { reachOf } from "@/server/auth/reach";
import {
  canBecomeExpense,
  isReceiptContentType,
  isReceiptStatus,
  RECEIPT_MAX_BYTES,
} from "@/domain/receipts";

export class ReceiptError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export const SUBMITTER_ROLES = [
  "employee",
  "consultant",
  "manager",
  "accountant",
];

export const canReviewReceipts = (actor: PortalUser) =>
  can(actor, "documents.receipts.review");
export const canBookReceipts = (actor: PortalUser) =>
  can(actor, "documents.receipts.book") && can(actor, "finance.ledger.add");
export const canViewOwnReceipts = (actor: PortalUser) =>
  SUBMITTER_ROLES.includes(actor.role) && can(actor, "my.receipts");
export const canSubmitReceipts = (actor: PortalUser) =>
  canViewOwnReceipts(actor) && can(actor, "my.receipts.upload");
export const canUseReceipts = (actor: PortalUser) =>
  canReviewReceipts(actor) || canViewOwnReceipts(actor);

/**
 * Own receipts through `my.receipts`; others' only when the reviewer's reach
 * includes the submitter.
 */
export function receiptVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
  reach: Reach,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canViewOwnReceipts(actor) && data.userId === actor.id) return true;
  return canReviewReceipts(actor) && reachesUser(reach, data.userId);
}

async function audit(
  db: Firestore,
  actor: PortalUser,
  action: string,
  receiptId: string,
  metadata: Record<string, unknown> = {},
) {
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType: "receipt",
    entityId: receiptId,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  });
}

export async function createReceipt(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: {
    date: string;
    name: string;
    description: string;
    netMinor: number;
    vatMinor: number;
  },
  file: File,
) {
  if (!canSubmitReceipts(actor)) throw new ReceiptError("forbidden", 403);
  if (file.size === 0) throw new ReceiptError("receiptFileRequired");
  if (file.size > RECEIPT_MAX_BYTES)
    throw new ReceiptError("receiptFileTooLarge");
  if (!isReceiptContentType(file.type))
    throw new ReceiptError("receiptFileType");
  const ref = db.collection("receipts").doc();
  const storagePath = `organizations/${actor.organizationId}/receipts/${actor.id}/${ref.id}-${randomUUID()}`;
  const object = storage.bucket().file(storagePath);
  await object.save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    metadata: { contentType: file.type, cacheControl: "private, no-cache" },
  });
  try {
    await ref.create({
      organizationId: actor.organizationId,
      userId: actor.id,
      userName: actor.displayName,
      employeeNumber: actor.employeeNumber ?? "",
      date: input.date,
      name: input.name,
      description: input.description,
      netMinor: input.netMinor,
      vatMinor: input.vatMinor,
      grossMinor: input.netMinor + input.vatMinor,
      fileName: file.name.replace(/[\r\n]/g, "").slice(0, 180) || "receipt",
      contentType: file.type,
      size: file.size,
      storagePath,
      status: "pending",
      reviewNote: "",
      reviewedBy: null,
      reviewedAt: null,
      expenseTransactionId: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
  await audit(db, actor, "receipt.submitted", ref.id);
  return ref.id;
}

export async function reviewReceipt(
  db: Firestore,
  actor: PortalUser,
  receiptId: string,
  input: { status: "approved" | "rejected"; note: string },
) {
  if (!canReviewReceipts(actor)) throw new ReceiptError("forbidden", 403);
  const reach = await reachOf(db, actor);
  const ref = db.collection("receipts").doc(receiptId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.organizationId !== actor.organizationId ||
      !reachesUser(reach, data.userId)
    )
      throw new ReceiptError("notFound", 404);
    if (data.expenseTransactionId)
      throw new ReceiptError("receiptExpenseLinked", 409);
    transaction.update(ref, {
      status: input.status,
      reviewNote: input.note,
      reviewedBy: actor.id,
      reviewedAt: FieldValue.serverTimestamp(),
    });
  });
  await audit(db, actor, `receipt.${input.status}`, receiptId, {
    note: input.note,
  });
}

/** Loads a receipt that may be booked as an expense, or throws. */
export async function expensableReceipt(
  db: Firestore,
  actor: PortalUser,
  receiptId: string,
) {
  if (!canBookReceipts(actor)) throw new ReceiptError("forbidden", 403);
  const [snapshot, reach] = await Promise.all([
    db.collection("receipts").doc(receiptId).get(),
    reachOf(db, actor),
  ]);
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.organizationId !== actor.organizationId ||
    !reachesUser(reach, data.userId)
  )
    throw new ReceiptError("notFound", 404);
  const status = isReceiptStatus(data.status) ? data.status : "pending";
  if (
    !canBecomeExpense({
      status,
      expenseTransactionId: data.expenseTransactionId ?? null,
    })
  )
    throw new ReceiptError("receiptNotExpensable", 409);
  return { ...data, id: snapshot.id } as FirebaseFirestore.DocumentData & {
    id: string;
  };
}

export async function linkReceiptExpense(
  db: Firestore,
  actor: PortalUser,
  receiptId: string,
  transactionId: string,
) {
  const reach = await reachOf(db, actor);
  const ref = db.collection("receipts").doc(receiptId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.organizationId !== actor.organizationId ||
      !reachesUser(reach, data.userId) ||
      data.status !== "approved" ||
      data.expenseTransactionId
    )
      throw new ReceiptError("receiptNotExpensable", 409);
    transaction.update(ref, { expenseTransactionId: transactionId });
  });
  await audit(db, actor, "receipt.expenseCreated", receiptId, {
    transactionId,
  });
}
