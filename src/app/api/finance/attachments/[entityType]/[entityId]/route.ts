import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const entityCollections = {
  transaction: "financialTransactions",
  vatSettlement: "vatSettlements",
} as const;
const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeName(name: string) {
  return name.replace(/[\r\n]/g, "").slice(0, 180) || "attachment";
}

async function context(entityType: string, entityId: string, write: boolean) {
  const actor = await verifySession();
  if (!actor)
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  const collection =
    entityCollections[entityType as keyof typeof entityCollections];
  if (!collection)
    return {
      error: NextResponse.json({ error: "invalidInput" }, { status: 400 }),
    };
  const { db, storage } = getAdminServices();
  const entity = await db.collection(collection).doc(entityId).get();
  const data = entity.data();
  if (!entity.exists || data?.organizationId !== actor.organizationId)
    return { error: NextResponse.json({ error: "notFound" }, { status: 404 }) };
  const manager = ["admin", "accountant"].includes(actor.role);
  const consultantCanRead =
    !write &&
    entityType === "transaction" &&
    data?.consultantId === actor.id &&
    actor.financeAccess.myFinance;
  if (!manager && !consultantCanRead)
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  return { actor, db, storage, entity, data };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const { entityType, entityId } = await params;
  const value = await context(entityType, entityId, false);
  if ("error" in value) return value.error;
  const snapshot = await value.db
    .collection("financeAttachments")
    .where("organizationId", "==", value.actor.organizationId)
    .where("entityType", "==", entityType)
    .where("entityId", "==", entityId)
    .get();
  return NextResponse.json({
    attachments: snapshot.docs.map((document) => ({
      id: document.id,
      name: String(document.data().name),
      size: Number(document.data().size),
      contentType: String(document.data().contentType),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const { entityType, entityId } = await params;
  const value = await context(entityType, entityId, true);
  if ("error" in value) return value.error;
  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0);
  const existing = await value.db
    .collection("financeAttachments")
    .where("organizationId", "==", value.actor.organizationId)
    .where("entityType", "==", entityType)
    .where("entityId", "==", entityId)
    .get();
  if (!files.length || existing.size + files.length > MAX_FILES)
    return NextResponse.json({ error: "attachmentLimit" }, { status: 400 });
  if (files.some((file) => file.size > MAX_BYTES))
    return NextResponse.json({ error: "attachmentTooLarge" }, { status: 400 });
  if (files.some((file) => !allowedTypes.has(file.type)))
    return NextResponse.json({ error: "attachmentType" }, { status: 400 });

  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const path = `organizations/${value.actor.organizationId}/finance/${entityType}/${entityId}/${id}`;
      await value.storage
        .bucket()
        .file(path)
        .save(Buffer.from(await file.arrayBuffer()), {
          resumable: false,
          metadata: {
            contentType: file.type,
            cacheControl: "private, no-cache",
          },
        });
      uploaded.push(path);
      await value.db
        .collection("financeAttachments")
        .doc(id)
        .create({
          organizationId: value.actor.organizationId,
          entityType,
          entityId,
          name: safeName(file.name),
          size: file.size,
          contentType: file.type,
          storagePath: path,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: value.actor.id,
        });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((path) => value.storage.bucket().file(path).delete()),
    );
    console.error("Finance attachment upload failed", {
      entityType,
      entityId,
      error,
    });
    return NextResponse.json(
      { error: "attachmentUploadFailed" },
      { status: 500 },
    );
  }
}
