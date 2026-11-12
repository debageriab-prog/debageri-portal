import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AssetError,
  canManageAssets,
  handoverVisible,
  storedAssetFiles,
  uploadHandoverScan,
} from "@/server/services/asset-service";
import { fileResponse } from "../../../file-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const snapshot = await db.collection("assetHandovers").doc(id).get();
  const data = snapshot.data();
  const [scan] = storedAssetFiles(data?.scan ? [data.scan] : []);
  if (!data || !handoverVisible(actor, data) || !scan)
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [contents] = await storage.bucket().file(scan.storagePath).download();
  return fileResponse(request, scan, contents);
}

/** Stores a scan of the receipt signed by hand. */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db, storage } = getAdminServices();
  try {
    await uploadHandoverScan(db, storage, actor, id, file);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Equipment receipt scan failed", { handoverId: id, error });
    return NextResponse.json({ error: "handoverSaveFailed" }, { status: 500 });
  }
}
