import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { PortalUser } from "@/domain/types";
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

const submitterRoles = ["employee", "consultant", "manager"];

export const canReviewReceipts = (actor: PortalUser) =>
  ["admin", "accountant"].includes(actor.role);
export const canSubmitReceipts = (actor: PortalUser) =>
  submitterRoles.includes(actor.role) && actor.documentAccess.receipts;
export const canUseReceipts = (actor: PortalUser) =>
  canReviewReceipts(actor) || canSubmitReceipts(actor);

export function receiptVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canReviewReceipts(actor)) return true;
  return canSubmitReceipts(actor) && data.userId === actor.id;
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
  const ref = db.collection("receipts").doc(receiptId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists || data?.organizationId !== actor.organizationId)
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
  if (!canReviewReceipts(actor)) throw new ReceiptError("forbidden", 403);
  const snapshot = await db.collection("receipts").doc(receiptId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
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
  const ref = db.collection("receipts").doc(receiptId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.organizationId !== actor.organizationId ||
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
