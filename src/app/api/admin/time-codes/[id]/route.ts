import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { timeCodeSchema } from "@/server/validators/time-code";

async function load(id: string) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin") return null;
  const { db } = getAdminServices();
  const snapshot = await db.collection("timeCodes").doc(id).get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    return null;
  return { actor, db, snapshot };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await load(id);
  if (!loaded)
    return NextResponse.json(
      { error: "Time code not found." },
      { status: 404 },
    );
  const parsed = timeCodeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the time code details and try again." },
      { status: 400 },
    );
  const duplicate = await loaded.db
    .collection("timeCodes")
    .where("organizationId", "==", loaded.actor.organizationId)
    .get();
  if (
    duplicate.docs.some(
      (doc) => doc.id !== id && doc.data().code === parsed.data.code,
    )
  )
    return NextResponse.json(
      { error: "A time code with this code already exists." },
      { status: 409 },
    );
  await loaded.snapshot.ref.update({
    code: parsed.data.code,
    name: { en: parsed.data.name, sv: parsed.data.name },
    category: parsed.data.category,
    hourlyRate: parsed.data.hourlyRate,
    active: parsed.data.active,
    employeeCanSelect: parsed.data.employeeCanSelect,
    requiresComment: parsed.data.requiresComment,
    countsAsWorkedTime: parsed.data.countsAsWorkedTime,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await load(id);
  if (!loaded)
    return NextResponse.json(
      { error: "Time code not found." },
      { status: 404 },
    );
  const confirmation = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (confirmation?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: 'Type "I am sure" to confirm deletion.' },
      { status: 400 },
    );
  await loaded.snapshot.ref.delete();
  return NextResponse.json({ ok: true });
}
