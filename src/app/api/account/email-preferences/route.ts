import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { emailPreferencesSchema } from "@/server/validators/user-access";

/** Lets every signed-in person choose which notification emails they get. */
export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = emailPreferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  const batch = db.batch();
  batch.update(db.collection("users").doc(actor.id), {
    emailPreferences: parsed.data,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "user.emailPreferencesUpdated",
    entityType: "user",
    entityId: actor.id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { emailPreferences: parsed.data },
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
