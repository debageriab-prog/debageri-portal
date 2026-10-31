import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { PortalUser } from "@/domain/types";
import {
  isPayslipContentType,
  PAYSLIP_MAX_BYTES,
  payslipId,
  payslipPeriod,
} from "@/domain/payslips";
import { receivesDocuments } from "@/server/validators/user-access";

export class PayslipError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

const recipientRoles = ["employee", "consultant", "manager"];

export const canManagePayslips = (actor: PortalUser) =>
  ["admin", "accountant"].includes(actor.role);
export const canViewOwnPayslips = (actor: PortalUser) =>
  recipientRoles.includes(actor.role) && actor.documentAccess.payslips;
export const canReadPayslips = (actor: PortalUser) =>
  canManagePayslips(actor) || canViewOwnPayslips(actor);

export function payslipVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canManagePayslips(actor)) return true;
  return canViewOwnPayslips(actor) && data.userId === actor.id;
}

export async function uploadPayslip(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: {
    userId: string;
    year: number;
    month: number;
    replaceExisting: boolean;
  },
  file: File,
) {
  if (file.size === 0) throw new PayslipError("payslipFileRequired");
  if (file.size > PAYSLIP_MAX_BYTES)
    throw new PayslipError("payslipFileTooLarge");
  if (!isPayslipContentType(file.type))
    throw new PayslipError("payslipFileType");
  const recipient = await db.collection("users").doc(input.userId).get();
  const recipientData = recipient.data();
  if (
    !recipientData ||
    recipientData.organizationId !== actor.organizationId ||
    !receivesDocuments(recipientData) ||
    !recipientRoles.includes(String(recipientData.role))
  )
    throw new PayslipError("invalidRecipient");
  const period = payslipPeriod(input.year, input.month);
  const ref = db
    .collection("payslips")
    .doc(payslipId(actor.organizationId, input.userId, period));
  const existing = await ref.get();
  if (existing.exists && !input.replaceExisting)
    throw new PayslipError("payslipExists", 409);
  const storagePath = `organizations/${actor.organizationId}/documents/payslips/${input.userId}/${period}-${randomUUID()}`;
  const object = storage.bucket().file(storagePath);
  await object.save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    metadata: { contentType: file.type, cacheControl: "private, no-cache" },
  });
  try {
    await ref.set({
      organizationId: actor.organizationId,
      userId: input.userId,
      userName: String(recipientData.displayName),
      period,
      year: input.year,
      month: input.month,
      fileName: file.name.replace(/[\r\n]/g, "").slice(0, 180) || "payslip",
      contentType: file.type,
      size: file.size,
      storagePath,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
  const previousPath = existing.data()?.storagePath;
  if (previousPath)
    await storage
      .bucket()
      .file(String(previousPath))
      .delete({ ignoreNotFound: true });
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: existing.exists ? "payslip.replaced" : "payslip.uploaded",
    entityType: "payslip",
    entityId: ref.id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { userId: input.userId, period },
  });
  return ref.id;
}

export async function deletePayslip(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  id: string,
) {
  const ref = db.collection("payslips").doc(id);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new PayslipError("notFound", 404);
  await storage
    .bucket()
    .file(String(data.storagePath))
    .delete({ ignoreNotFound: true });
  await ref.delete();
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "payslip.deleted",
    entityType: "payslip",
    entityId: id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { userId: String(data.userId), period: String(data.period) },
  });
}
