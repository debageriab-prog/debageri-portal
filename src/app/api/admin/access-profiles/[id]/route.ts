import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AccessProfileError,
  deleteAccessProfile,
  updateAccessProfile,
} from "@/server/services/access-profile-service";
import { accessProfileSchema } from "@/server/validators/access-profile";

function failure(error: unknown) {
  if (error instanceof AccessProfileError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  console.error("Access profile change failed", { error });
  return NextResponse.json({ error: "saveFailed" }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = accessProfileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    await updateAccessProfile(getAdminServices().db, actor, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await deleteAccessProfile(getAdminServices().db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
