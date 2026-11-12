import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  assetVisible,
  storedAssetFiles,
} from "@/server/services/asset-service";
import { fileResponse } from "../../../file-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const snapshot = await db.collection("assets").doc(id).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || !assetVisible(actor, data))
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const file = storedAssetFiles(data.files).find((item) => item.id === fileId);
  if (!file) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [contents] = await storage.bucket().file(file.storagePath).download();
  return fileResponse(request, file, contents);
}
