import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AssetError,
  canManageAssets,
  changeAsset,
  deleteAsset,
  updateAsset,
} from "@/server/services/asset-service";
import { assetActionSchema, parseAssetForm } from "@/server/validators/assets";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
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
    await updateAsset(db, storage, actor, id, parsed.data, files);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Asset update failed", { assetId: id, error });
    return NextResponse.json({ error: "assetSaveFailed" }, { status: 500 });
  }
}

/** Changes who holds the equipment, sells it, or retires it. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = assetActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  try {
    await changeAsset(db, actor, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Asset change failed", { assetId: id, error });
    return NextResponse.json({ error: "assetSaveFailed" }, { status: 500 });
  }
}

/** Removes the asset; the person typed the confirmation phrase first. */
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db, storage } = getAdminServices();
  try {
    await deleteAsset(db, storage, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Asset removal failed", { assetId: id, error });
    return NextResponse.json({ error: "assetSaveFailed" }, { status: 500 });
  }
}
