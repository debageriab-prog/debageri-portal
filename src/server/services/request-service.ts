import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { can } from "@/domain/access/permissions";
import type { PortalUser } from "@/domain/types";
import {
  canBecomeExpense,
  canTransition,
  isEditableRequest,
  isRequestContentType,
  isRequestStatus,
  REQUEST_MAX_BYTES,
  REQUEST_MAX_FILES,
  REQUEST_TYPE_PERMISSIONS,
  type RequestStatus,
  type RequestType,
} from "@/domain/requests";
import type { RequestFormInput } from "@/server/validators/requests";

export class RequestError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export const REQUESTER_ROLES = [
  "employee",
  "consultant",
  "manager",
  "accountant",
];

export type StoredRequestFile = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
};

export const canReviewRequests = (actor: PortalUser) =>
  can(actor, "documents.requests.review");
/** Creating the expense itself happens in Finance, which needs ledger access. */
export const canBookRequests = (actor: PortalUser) =>
  can(actor, "documents.requests.book") && can(actor, "finance.ledger.add");
export const canViewOwnRequests = (actor: PortalUser) =>
  REQUESTER_ROLES.includes(actor.role) && can(actor, "my.requests");
export const canRequestType = (actor: PortalUser, type: RequestType) =>
  canViewOwnRequests(actor) && can(actor, REQUEST_TYPE_PERMISSIONS[type]);
export const canSubmitRequests = (actor: PortalUser) =>
  canViewOwnRequests(actor) &&
  Object.values(REQUEST_TYPE_PERMISSIONS).some((key) => can(actor, key));
export const canUseRequests = (actor: PortalUser) =>
  canReviewRequests(actor) || canViewOwnRequests(actor);

export function requestVisible(
  actor: PortalUser,
  data: FirebaseFirestore.DocumentData,
) {
  if (data.organizationId !== actor.organizationId) return false;
  if (canReviewRequests(actor)) return true;
  return canViewOwnRequests(actor) && data.userId === actor.id;
}

export function storedRequestFiles(value: unknown): StoredRequestFile[] {
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

const stockholmToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(
    new Date(),
  );

function auditEntry(
  actor: PortalUser,
  action: string,
  requestId: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType: "request",
    entityId: requestId,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  };
}

function checkFiles(files: File[]) {
  for (const file of files) {
    if (file.size === 0) throw new RequestError("requestFileEmpty");
    if (file.size > REQUEST_MAX_BYTES)
      throw new RequestError("requestFileTooLarge");
    if (!isRequestContentType(file.type))
      throw new RequestError("requestFileType");
  }
}

async function uploadFiles(
  storage: Storage,
  actor: PortalUser,
  requestId: string,
  files: File[],
) {
  const uploaded: StoredRequestFile[] = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const storagePath = `organizations/${actor.organizationId}/requests/${actor.id}/${requestId}/${id}`;
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

async function removeFiles(storage: Storage, files: StoredRequestFile[]) {
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

function requestFields(input: RequestFormInput) {
  return {
    type: input.type,
    title: input.title,
    description: input.description,
    links: input.links,
    estimatedCostMinor: input.estimatedCostMinor,
    payer: input.payer,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export async function createRequest(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: RequestFormInput,
  files: File[],
) {
  if (!canSubmitRequests(actor)) throw new RequestError("forbidden", 403);
  if (!canRequestType(actor, input.type))
    throw new RequestError("typeNotAllowed", 403);
  if (files.length > REQUEST_MAX_FILES)
    throw new RequestError("requestTooManyFiles");
  checkFiles(files);
  const ref = db.collection("requests").doc();
  const uploaded = await uploadFiles(storage, actor, ref.id, files);
  try {
    const batch = db.batch();
    batch.create(ref, {
      organizationId: actor.organizationId,
      userId: actor.id,
      userName: actor.displayName,
      employeeNumber: actor.employeeNumber ?? "",
      ...requestFields(input),
      files: uploaded,
      status: "requested",
      reviewNote: "",
      reviewedBy: null,
      reviewedAt: null,
      expenseTransactionId: null,
      submittedOn: stockholmToday(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection("requestEvents").doc(), {
      organizationId: actor.organizationId,
      requestId: ref.id,
      userId: actor.id,
      fromStatus: null,
      toStatus: "requested",
      note: "",
      performedBy: actor.id,
      performedByName: actor.displayName,
      performedAt: FieldValue.serverTimestamp(),
    });
    batch.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "request.submitted", ref.id, { type: input.type }),
    );
    await batch.commit();
  } catch (error) {
    await removeFiles(storage, uploaded);
    throw error;
  }
  return ref.id;
}

/** The requester changes their own request while nobody has picked it up. */
export async function updateRequest(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  requestId: string,
  input: RequestFormInput,
  files: File[],
) {
  if (!canViewOwnRequests(actor)) throw new RequestError("forbidden", 403);
  if (!canRequestType(actor, input.type))
    throw new RequestError("typeNotAllowed", 403);
  checkFiles(files);
  const ref = db.collection("requests").doc(requestId);
  const before = await ref.get();
  const current = before.data();
  if (
    !before.exists ||
    current?.organizationId !== actor.organizationId ||
    current.userId !== actor.id
  )
    throw new RequestError("notFound", 404);
  const existing = storedRequestFiles(current.files);
  const kept = existing.filter((file) => input.keepFileIds.includes(file.id));
  if (kept.length + files.length > REQUEST_MAX_FILES)
    throw new RequestError("requestTooManyFiles");
  const uploaded = await uploadFiles(storage, actor, requestId, files);
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const status = isRequestStatus(data?.status) ? data.status : "requested";
      if (!data || !isEditableRequest({ status }))
        throw new RequestError("requestLocked", 409);
      const latest = storedRequestFiles(data.files).filter((file) =>
        input.keepFileIds.includes(file.id),
      );
      transaction.update(ref, {
        ...requestFields(input),
        files: [...latest, ...uploaded],
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(
        db.collection("auditLogs").doc(),
        auditEntry(actor, "request.updated", requestId, { type: input.type }),
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

/**
 * Moves a request to a new status. Reviewers decide on other people's
 * requests; the requester can only withdraw their own. The change, its
 * history entry and the audit entry are written together.
 */
export async function changeRequestStatus(
  db: Firestore,
  actor: PortalUser,
  requestId: string,
  input: { status: RequestStatus; note: string },
) {
  const ref = db.collection("requests").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !requestVisible(actor, data))
      throw new RequestError("notFound", 404);
    const own = data.userId === actor.id;
    const by = input.status === "withdrawn" ? "owner" : "reviewer";
    if (by === "owner" ? !own : !canReviewRequests(actor))
      throw new RequestError("forbidden", 403);
    if (by === "reviewer" && own) throw new RequestError("ownRequest", 403);
    const from = isRequestStatus(data.status) ? data.status : "requested";
    if (!canTransition(from, input.status, by))
      throw new RequestError("invalidTransition", 409);
    transaction.update(ref, {
      status: input.status,
      ...(by === "reviewer"
        ? {
            // An empty note keeps the last one, so the requester still sees it.
            ...(input.note ? { reviewNote: input.note } : {}),
            reviewedBy: actor.id,
            reviewedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(db.collection("requestEvents").doc(), {
      organizationId: actor.organizationId,
      requestId,
      userId: String(data.userId),
      fromStatus: from,
      toStatus: input.status,
      note: input.note,
      performedBy: actor.id,
      performedByName: actor.displayName,
      performedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, `request.${input.status}`, requestId, {
        fromStatus: from,
        toStatus: input.status,
        note: input.note,
      }),
    );
    return { from, to: input.status };
  });
}

/** Loads a request that may be booked as an expense, or throws. */
export async function expensableRequest(
  db: Firestore,
  actor: PortalUser,
  requestId: string,
) {
  if (!canBookRequests(actor)) throw new RequestError("forbidden", 403);
  const snapshot = await db.collection("requests").doc(requestId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new RequestError("notFound", 404);
  const status = isRequestStatus(data.status) ? data.status : "requested";
  if (
    !canBecomeExpense({
      status,
      expenseTransactionId: data.expenseTransactionId ?? null,
    })
  )
    throw new RequestError("requestNotExpensable", 409);
  return { ...data, id: snapshot.id } as FirebaseFirestore.DocumentData & {
    id: string;
  };
}

export async function linkRequestExpense(
  db: Firestore,
  actor: PortalUser,
  requestId: string,
  transactionId: string,
) {
  const ref = db.collection("requests").doc(requestId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (
      !snapshot.exists ||
      data?.organizationId !== actor.organizationId ||
      data.status !== "finalized" ||
      data.expenseTransactionId
    )
      throw new RequestError("requestNotExpensable", 409);
    transaction.update(ref, {
      expenseTransactionId: transactionId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(
      db.collection("auditLogs").doc(),
      auditEntry(actor, "request.expenseCreated", requestId, {
        transactionId,
      }),
    );
  });
}
