import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { can } from "@/domain/access/permissions";
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

export const RECIPIENT_ROLES = [
  "employee",
  "consultant",
  "manager",
  "accountant",
];

export const canUploadPayslips = (actor: PortalUser) =>
  can(actor, "documents.payslips.upload");
export const canDeletePayslips = (actor: PortalUser) =>
  can(actor, "documents.payslips.delete");
export const canReadAllPayslips = (actor: PortalUser) =>
  can(actor, "documents.payslips.view");
export const canViewOwnPayslips = (actor: PortalUser) =>
  RECIPIENT_ROLES.includes(actor.role) && can(actor, "my.payslips");
export const canReadPayslips = (actor: PortalUser) =>
  canReadAllPayslips(actor) || canViewOwnPayslips(actor);

export function payslipVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canReadAllPayslips(actor)) return true;
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
    !RECIPIENT_ROLES.includes(String(recipientData.role))
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

/**
 * Stores a payslip made from a salary row, as the person's payslip for that
 * month. The same file is later attached to the salary's expenses, so it is
 * generated once. An uploaded payslip for the month is only replaced when
 * asked; one made from the same salary row is replaced without asking.
 */
export async function storeGeneratedPayslip(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: {
    userId: string;
    userName: string;
    period: string;
    salarySlipId: string;
    fileName: string;
    pdf: Buffer;
    replaceExisting: boolean;
  },
) {
  const [year, month] = input.period.split("-").map(Number) as [number, number];
  const ref = db
    .collection("payslips")
    .doc(payslipId(actor.organizationId, input.userId, input.period));
  const existing = await ref.get();
  const previous = existing.data();
  if (
    existing.exists &&
    previous?.salarySlipId !== input.salarySlipId &&
    !input.replaceExisting
  )
    throw new PayslipError("payslipExists", 409);
  const storagePath = `organizations/${actor.organizationId}/documents/payslips/${input.userId}/${input.period}-${randomUUID()}.pdf`;
  const object = storage.bucket().file(storagePath);
  await object.save(input.pdf, {
    resumable: false,
    metadata: {
      contentType: "application/pdf",
      cacheControl: "private, no-cache",
    },
  });
  try {
    await ref.set({
      organizationId: actor.organizationId,
      userId: input.userId,
      userName: input.userName,
      period: input.period,
      year,
      month,
      fileName: input.fileName,
      contentType: "application/pdf",
      size: input.pdf.length,
      storagePath,
      generated: true,
      salarySlipId: input.salarySlipId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
  if (previous?.storagePath)
    await storage
      .bucket()
      .file(String(previous.storagePath))
      .delete({ ignoreNotFound: true });
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: existing.exists ? "payslip.replaced" : "payslip.generated",
    entityType: "payslip",
    entityId: ref.id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      userId: input.userId,
      period: input.period,
      salarySlipId: input.salarySlipId,
    },
  });
  return { id: ref.id, storagePath };
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
  // A booked salary's expenses share this file, so it stays.
  if (data.salarySlipId) {
    const slip = await db
      .collection("salarySlips")
      .doc(String(data.salarySlipId))
      .get();
    if (slip.data()?.status === "booked")
      throw new PayslipError("payslipBooked", 409);
  }
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
