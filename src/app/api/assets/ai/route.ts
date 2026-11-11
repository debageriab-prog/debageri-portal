import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AiError,
  extractAssetDocument,
  type ExtractionFile,
} from "@/server/services/ai-service";
import {
  AssetError,
  assetSourceFile,
  canManageAssets,
} from "@/server/services/asset-service";

const MAX_BYTES = 10 * 1024 * 1024;

const referenceSchema = z.object({
  transactionId: z.string().min(1).max(128),
  attachmentId: z.string().min(1).max(128),
});

/**
 * Reads an asset's purchase document with AI: a file picked in the form
 * (multipart `file`) or a file of the expense the asset is created from
 * (JSON `{ transactionId, attachmentId }`). Nothing is saved; the form is
 * filled in for the person to check.
 */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db, storage } = getAdminServices();
  let file: ExtractionFile;
  try {
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
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
        contentType: upload.type,
        bytes: Buffer.from(await upload.arrayBuffer()),
      };
    } else {
      const parsed = referenceSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return NextResponse.json({ error: "invalidInput" }, { status: 400 });
      file = await assetSourceFile(
        db,
        storage,
        actor,
        parsed.data.transactionId,
        parsed.data.attachmentId,
      );
      if (file.bytes.length > MAX_BYTES)
        return NextResponse.json(
          { error: "attachmentTooLarge" },
          { status: 400 },
        );
    }
    const extraction = await extractAssetDocument(
      db,
      actor.organizationId,
      file,
    );
    return NextResponse.json({ extraction });
  } catch (error) {
    if (error instanceof AiError)
      return NextResponse.json(
        { error: error.code, detail: error.detail },
        { status: error.status },
      );
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
