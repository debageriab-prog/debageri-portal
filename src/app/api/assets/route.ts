import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AssetError,
  canManageAssets,
  createAsset,
} from "@/server/services/asset-service";
import { parseAssetForm } from "@/server/validators/assets";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parseAssetForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);
  const { db, storage } = getAdminServices();
  try {
    const id = await createAsset(db, storage, actor, parsed.data, files);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Asset creation failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "assetSaveFailed" }, { status: 500 });
  }
}
