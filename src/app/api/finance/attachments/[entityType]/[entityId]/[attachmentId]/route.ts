import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

async function authorized(
  entityType: string,
  entityId: string,
  attachmentId: string,
  write = false,
) {
  const actor = await verifySession();
  if (!actor)
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  const collection =
    entityType === "transaction"
      ? "financialTransactions"
      : entityType === "vatSettlement"
        ? "vatSettlements"
        : null;
  if (!collection)
    return {
      error: NextResponse.json({ error: "invalidInput" }, { status: 400 }),
    };
  const { db, storage } = getAdminServices();
  const [entity, attachment] = await Promise.all([
    db.collection(collection).doc(entityId).get(),
    db.collection("financeAttachments").doc(attachmentId).get(),
  ]);
  const entityData = entity.data();
  const fileData = attachment.data();
  const validFile =
    attachment.exists &&
    fileData?.organizationId === actor.organizationId &&
    fileData?.entityType === entityType &&
    fileData?.entityId === entityId;
  const manager = ["admin", "accountant"].includes(actor.role);
  const consultantCanRead =
    !write &&
    entityType === "transaction" &&
    entityData?.consultantId === actor.id &&
    actor.financeAccess.myFinance;
  if (
    !entity.exists ||
    entityData?.organizationId !== actor.organizationId ||
    !validFile
  )
    return { error: NextResponse.json({ error: "notFound" }, { status: 404 }) };
  if (!manager && !consultantCanRead)
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  return { actor, db, storage, attachment, fileData: fileData! };
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      entityType: string;
      entityId: string;
      attachmentId: string;
    }>;
  },
) {
  const p = await params;
  const value = await authorized(p.entityType, p.entityId, p.attachmentId);
  if ("error" in value) return value.error;
  const [contents] = await value.storage
    .bucket()
    .file(String(value.fileData.storagePath))
    .download();
  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": String(value.fileData.contentType),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(value.fileData.name))}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      entityType: string;
      entityId: string;
      attachmentId: string;
    }>;
  },
) {
  const p = await params;
  const value = await authorized(
    p.entityType,
    p.entityId,
    p.attachmentId,
    true,
  );
  if ("error" in value) return value.error;
  await value.storage
    .bucket()
    .file(String(value.fileData.storagePath))
    .delete({ ignoreNotFound: true });
  await value.attachment.ref.delete();
  return NextResponse.json({ ok: true });
}
