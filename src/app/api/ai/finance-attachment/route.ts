import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeAttachmentReferenceSchema } from "@/server/validators/ai";
import {
  AiError,
  extractFinanceDocument,
  type ExtractionFile,
} from "@/server/services/ai-service";

const MAX_BYTES = 10 * 1024 * 1024;

function contentType(name: string, type: string) {
  return name.toLowerCase().endsWith(".eml") ? "message/rfc822" : type;
}

/**
 * Reads a transaction attachment with AI. Accepts either a file that has not
 * been uploaded yet (multipart `file`) or a stored attachment (JSON
 * `{ entityId, attachmentId }`). Nothing is saved; the caller fills its form.
 */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!["admin", "accountant"].includes(actor.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db, storage } = getAdminServices();

  let file: ExtractionFile;
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const upload = (await request.formData().catch(() => null))?.get("file");
    if (!(upload instanceof File) || upload.size === 0)
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    if (upload.size > MAX_BYTES)
      return NextResponse.json(
        { error: "attachmentTooLarge" },
        { status: 400 },
      );
    file = {
      name: upload.name,
      contentType: contentType(upload.name, upload.type),
      bytes: Buffer.from(await upload.arrayBuffer()),
    };
  } else {
    const parsed = financeAttachmentReferenceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    const attachment = await db
      .collection("financeAttachments")
      .doc(parsed.data.attachmentId)
      .get();
    const data = attachment.data();
    if (
      !attachment.exists ||
      data?.organizationId !== actor.organizationId ||
      data?.entityType !== "transaction" ||
      data?.entityId !== parsed.data.entityId
    )
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    const [bytes] = await storage
      .bucket()
      .file(String(data.storagePath))
      .download();
    file = {
      name: String(data.name),
      contentType: String(data.contentType),
      bytes,
    };
  }

  try {
    const extraction = await extractFinanceDocument(db, actor, file);
    return NextResponse.json({ extraction });
  } catch (error) {
    if (error instanceof AiError)
      return NextResponse.json(
        { error: error.code, detail: error.detail },
        { status: error.status },
      );
    throw error;
  }
}
