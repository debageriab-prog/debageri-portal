import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { holidaySchema } from "@/server/validators/holiday";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = holidaySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the date and description." },
      { status: 400 },
    );
  const { db } = getAdminServices();
  const existing = await db
    .collection("holidays")
    .where("organizationId", "==", actor.organizationId)
    .get();
  if (existing.docs.some((doc) => doc.data().date === parsed.data.date))
    return NextResponse.json(
      { error: "A red day already exists on this date." },
      { status: 409 },
    );
  const ref = db.collection("holidays").doc();
  await ref.create({
    organizationId: actor.organizationId,
    ...parsed.data,
    year: Number(parsed.data.date.slice(0, 4)),
    nonWorking: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.id,
  });
  return NextResponse.json({ id: ref.id }, { status: 201 });
}
