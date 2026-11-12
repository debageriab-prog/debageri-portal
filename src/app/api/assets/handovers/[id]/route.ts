import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { getServerLocale } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  acceptHandover,
  AssetError,
  cancelHandover,
  canManageAssets,
  returnHandover,
} from "@/server/services/asset-service";
import {
  notifyAssetHandoverAccepted,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { handoverActionSchema } from "@/server/validators/assets";

/** The recipient accepts; people who manage equipment cancel or take it back. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = handoverActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  if (parsed.data.action !== "accept" && !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db, storage } = getAdminServices();
  try {
    if (parsed.data.action === "accept") {
      await acceptHandover(
        db,
        storage,
        actor,
        id,
        parsed.data.place,
        parsed.data.signature,
        await getServerLocale(),
      );
      await notifyAssetHandoverAccepted(id, portalUrlFrom(request));
    } else if (parsed.data.action === "cancel")
      await cancelHandover(db, actor, id);
    else await returnHandover(db, actor, id, parsed.data.location);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Equipment receipt change failed", { handoverId: id, error });
    return NextResponse.json({ error: "handoverSaveFailed" }, { status: 500 });
  }
}
