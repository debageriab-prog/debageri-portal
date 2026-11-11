import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AssetError,
  canManageAssets,
  issueHandover,
} from "@/server/services/asset-service";
import {
  notifyAssetHandoverIssued,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { handoverIssueSchema } from "@/server/validators/assets";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canManageAssets(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = handoverIssueSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  try {
    const id = await issueHandover(db, actor, parsed.data);
    await notifyAssetHandoverIssued(id, portalUrlFrom(request));
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Equipment handover failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "handoverSaveFailed" }, { status: 500 });
  }
}
