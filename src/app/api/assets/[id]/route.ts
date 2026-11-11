import { NextResponse } from "next/server";
import {
  toAssetEvent,
  toAssetItem,
  toHandoverItem,
} from "@/app/assets/asset-data";
import type { HandoverItem } from "@/app/assets/asset-types";
import { can } from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AssetError,
  canManageAssets,
  canViewAssets,
  changeAsset,
  deleteAsset,
  updateAsset,
} from "@/server/services/asset-service";
import { financeIsEnabled } from "@/server/services/finance-service";
import { assetActionSchema, parseAssetForm } from "@/server/validators/assets";

type Context = { params: Promise<{ id: string }> };

/** The asset with its history and receipts, for the details popup. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canViewAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db } = getAdminServices();
  const snapshot = await db.collection("assets").doc(id).get();
  const asset =
    snapshot.data()?.organizationId === actor.organizationId
      ? toAssetItem(snapshot, actor)
      : null;
  if (!asset) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [events, handovers, financeEnabled] = await Promise.all([
    db
      .collection("assetEvents")
      .where("organizationId", "==", actor.organizationId)
      .where("assetId", "==", id)
      .get(),
    db
      .collection("assetHandovers")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    financeIsEnabled(db, actor.organizationId),
  ]);
  return NextResponse.json({
    asset,
    history: events.docs
      .map(toAssetEvent)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt)),
    handovers: handovers.docs
      .filter((doc) =>
        (doc.data().assetIds as unknown[] | undefined)?.includes(id),
      )
      .map(toHandoverItem)
      .filter((item): item is HandoverItem => item !== null)
      .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)),
    canBook:
      canManageAssets(actor) &&
      financeEnabled &&
      can(actor, "finance.ledger.add"),
  });
}

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
