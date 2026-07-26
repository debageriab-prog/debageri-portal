import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { timeCodeSchema } from "@/server/validators/time-code";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = timeCodeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the time code details and try again." },
      { status: 400 },
    );
  const { db } = getAdminServices();
  const duplicate = await db
    .collection("timeCodes")
    .where("organizationId", "==", actor.organizationId)
    .get();
  if (duplicate.docs.some((doc) => doc.data().code === parsed.data.code))
    return NextResponse.json(
      { error: "A time code with this code already exists." },
      { status: 409 },
    );
  const ref = db.collection("timeCodes").doc();
  await ref.create({
    organizationId: actor.organizationId,
    code: parsed.data.code,
    name: { en: parsed.data.name, sv: parsed.data.name },
    category: parsed.data.category,
    hourlyRate: parsed.data.hourlyRate,
    active: parsed.data.active,
    requiresComment: parsed.data.requiresComment,
    countsAsWorkedTime: parsed.data.countsAsWorkedTime,
    countsTowardExpectedTime: true,
    employeeCanSelect: true,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: null,
    sortOrder: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id }, { status: 201 });
}
