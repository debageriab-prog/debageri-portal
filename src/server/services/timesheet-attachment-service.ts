import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import {
  isUnsentTimesheetAttachment,
  TIMESHEET_ATTACHMENT_MAX_FILES,
  timesheetAttachmentAccess,
  timesheetAttachmentFileError,
} from "@/domain/timesheets/attachments";
import type { PortalUser } from "@/domain/types";

export class TimesheetAttachmentError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

const attachments = (db: Firestore) => db.collection("timesheetAttachments");

async function accessFor(db: Firestore, actor: PortalUser, ownerId: string) {
  const owner = (await db.collection("users").doc(ownerId).get()).data();
  if (!owner) throw new TimesheetAttachmentError("notFound", 404);
  return timesheetAttachmentAccess(actor, ownerId, {
    role: owner.role,
    reportsTime:
      owner.reportsTime ??
      ["employee", "consultant"].includes(String(owner.role)),
    organizationId: owner.organizationId,
  });
}

async function loadAttachment(
  db: Firestore,
  actor: PortalUser,
  timesheetId: string,
  attachmentId: string,
) {
  const snapshot = await attachments(db).doc(attachmentId).get();
  const data = snapshot.data();
  if (
    !data ||
    data.organizationId !== actor.organizationId ||
    data.timesheetId !== timesheetId
  )
    throw new TimesheetAttachmentError("notFound", 404);
  return {
    ref: snapshot.ref,
    data,
    access: await accessFor(db, actor, String(data.userId)),
  };
}

export async function listTimesheetAttachments(
  db: Firestore,
  actor: PortalUser,
  timesheetId: string,
) {
  const [sheet, files] = await Promise.all([
    db.collection("timesheets").doc(timesheetId).get(),
    attachments(db)
      .where("organizationId", "==", actor.organizationId)
      .where("timesheetId", "==", timesheetId)
      .get(),
  ]);
  const sheetData = sheet.data();
  if (sheetData && sheetData.organizationId !== actor.organizationId)
    throw new TimesheetAttachmentError("notFound", 404);
  // Deleting a report keeps its files, so they still name their owner.
  const ownerId = sheetData?.userId ?? files.docs[0]?.data().userId;
  if (!ownerId) return { attachments: [], canAdd: false };
  const access = await accessFor(db, actor, String(ownerId));
  if (!access.canView) throw new TimesheetAttachmentError("forbidden", 403);
  const removable = (file: FirebaseFirestore.DocumentData) =>
    access.canRemove ||
    (access.canAdd && isUnsentTimesheetAttachment(file, sheetData?.status));
  return {
    attachments: files.docs
      .sort(
        (a, b) =>
          Number(a.data().createdAt?.toMillis?.() ?? 0) -
          Number(b.data().createdAt?.toMillis?.() ?? 0),
      )
      .map((file) => ({
        id: file.id,
        name: String(file.data().name),
        size: Number(file.data().size),
        contentType: String(file.data().contentType),
        canRemove: removable(file.data()),
      })),
    canAdd: access.canAdd && sheet.exists,
  };
}

export async function addTimesheetAttachment(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  timesheetId: string,
  file: File,
) {
  const sheet = (
    await db.collection("timesheets").doc(timesheetId).get()
  ).data();
  if (!sheet || sheet.organizationId !== actor.organizationId)
    throw new TimesheetAttachmentError("notFound", 404);
  if (sheet.userId !== actor.id)
    throw new TimesheetAttachmentError("forbidden", 403);
  const fileError = timesheetAttachmentFileError(file);
  if (fileError) throw new TimesheetAttachmentError(fileError);
  const existing = await attachments(db)
    .where("organizationId", "==", actor.organizationId)
    .where("timesheetId", "==", timesheetId)
    .get();
  if (existing.size >= TIMESHEET_ATTACHMENT_MAX_FILES)
    throw new TimesheetAttachmentError("attachmentLimit");

  const ref = attachments(db).doc();
  const storagePath = `organizations/${actor.organizationId}/timesheets/${actor.id}/${timesheetId}/${ref.id}`;
  const object = storage.bucket().file(storagePath);
  await object.save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    metadata: { contentType: file.type, cacheControl: "private, no-cache" },
  });
  const name = file.name.replace(/[\r\n]/g, "").slice(0, 180) || "attachment";
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.create(ref, {
    organizationId: actor.organizationId,
    timesheetId,
    userId: actor.id,
    name,
    size: file.size,
    contentType: file.type,
    storagePath,
    createdAt: now,
    createdBy: actor.id,
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "timesheet.attachment_added",
    entityType: "timesheet",
    entityId: timesheetId,
    timestamp: now,
    metadata: { attachmentId: ref.id, name },
  });
  try {
    await batch.commit();
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }
}

export async function readTimesheetAttachment(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  timesheetId: string,
  attachmentId: string,
) {
  const { data, access } = await loadAttachment(
    db,
    actor,
    timesheetId,
    attachmentId,
  );
  if (!access.canView) throw new TimesheetAttachmentError("forbidden", 403);
  const [contents] = await storage
    .bucket()
    .file(String(data.storagePath))
    .download();
  return {
    contents,
    name: String(data.name),
    contentType: String(data.contentType),
  };
}

export async function removeTimesheetAttachment(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  timesheetId: string,
  attachmentId: string,
) {
  const { ref, data, access } = await loadAttachment(
    db,
    actor,
    timesheetId,
    attachmentId,
  );
  const sheet = await db.collection("timesheets").doc(timesheetId).get();
  if (
    !access.canRemove &&
    !(access.canAdd && isUnsentTimesheetAttachment(data, sheet.data()?.status))
  )
    throw new TimesheetAttachmentError("forbidden", 403);
  await storage
    .bucket()
    .file(String(data.storagePath))
    .delete({ ignoreNotFound: true });
  const batch = db.batch();
  batch.delete(ref);
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "timesheet.attachment_removed",
    entityType: "timesheet",
    entityId: timesheetId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { attachmentId, name: data.name, ownerId: data.userId },
  });
  await batch.commit();
}
