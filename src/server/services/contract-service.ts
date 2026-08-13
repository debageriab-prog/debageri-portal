import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { PortalUser } from "@/domain/types";

export class ContractError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export const canManageContracts = (actor: PortalUser) =>
  ["admin", "manager"].includes(actor.role);
export const canReadContracts = (actor: PortalUser) =>
  canManageContracts(actor) ||
  actor.role === "accountant" ||
  (actor.role === "consultant" && actor.documentAccess.contracts);

export async function assertConsultant(
  db: Firestore,
  actor: PortalUser,
  id: string | null,
) {
  if (!id) return null;
  const snapshot = await db.collection("users").doc(id).get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.organizationId !== actor.organizationId ||
    data?.role !== "consultant"
  )
    throw new ContractError("invalidConsultant");
  return String(data.displayName);
}

export function contractVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (["admin", "manager", "accountant"].includes(actor.role)) return true;
  return (
    actor.role === "consultant" &&
    actor.documentAccess.contracts &&
    data.ownerType === "consultant" &&
    data.consultantId === actor.id &&
    data.visibleToConsultant === true
  );
}

const MAX_FILES = 10;
const MAX_BYTES = 20 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export async function uploadContractFiles(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  contractId: string,
  files: File[],
) {
  if (files.length > MAX_FILES) throw new ContractError("contractFileLimit");
  if (files.some((file) => file.size > MAX_BYTES))
    throw new ContractError("contractFileTooLarge");
  if (files.some((file) => !allowedTypes.has(file.type)))
    throw new ContractError("contractFileType");
  const uploaded: { id: string; path: string }[] = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const path = `organizations/${actor.organizationId}/documents/contracts/${contractId}/${id}`;
      await storage
        .bucket()
        .file(path)
        .save(Buffer.from(await file.arrayBuffer()), {
          resumable: false,
          metadata: {
            contentType: file.type,
            cacheControl: "private, no-cache",
          },
        });
      await db
        .collection("contractFiles")
        .doc(id)
        .create({
          organizationId: actor.organizationId,
          contractId,
          name: file.name.replace(/[\r\n]/g, "").slice(0, 180) || "document",
          size: file.size,
          contentType: file.type,
          storagePath: path,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: actor.id,
        });
      uploaded.push({ id, path });
    }
  } catch (error) {
    await Promise.allSettled(
      uploaded.map(async ({ id, path }) => {
        await storage.bucket().file(path).delete({ ignoreNotFound: true });
        await db.collection("contractFiles").doc(id).delete();
      }),
    );
    throw error;
  }
}

export async function removeContractFiles(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  contractId: string,
  ids: string[],
) {
  for (const id of ids) {
    const file = await db.collection("contractFiles").doc(id).get();
    const data = file.data();
    if (
      !file.exists ||
      data?.organizationId !== actor.organizationId ||
      data?.contractId !== contractId
    )
      throw new ContractError("contractFileNotFound", 404);
    await storage
      .bucket()
      .file(String(data.storagePath))
      .delete({ ignoreNotFound: true });
    await file.ref.delete();
  }
}
