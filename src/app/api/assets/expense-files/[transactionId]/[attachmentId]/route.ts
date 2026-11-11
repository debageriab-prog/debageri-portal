import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { AssetError, assetSourceFile } from "@/server/services/asset-service";
import { fileResponse } from "../../../file-response";

/**
 * A file of the expense an asset is being created from, so the person adding
 * the asset can look at what will be copied to it.
 */
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ transactionId: string; attachmentId: string }> },
) {
  const { transactionId, attachmentId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  try {
    const file = await assetSourceFile(
      db,
      storage,
      actor,
      transactionId,
      attachmentId,
    );
    return fileResponse(request, file, file.bytes);
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Expense file for asset failed", { transactionId, error });
    return NextResponse.json({ error: "fileFailed" }, { status: 500 });
  }
}
