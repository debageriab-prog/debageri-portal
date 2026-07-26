import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await context.params;
  const { db } = getAdminServices();
  const snapshot = await db.collection("holidays").doc(id).get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    return NextResponse.json({ error: "Red day not found." }, { status: 404 });
  await snapshot.ref.delete();
  return NextResponse.json({ ok: true });
}
