import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { localeSchema } from "@/server/validators/user-access";

const inputSchema = z.object({ locale: localeSchema });

/** Stores the language a signed-in person chose; their emails use it too. */
export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  const batch = db.batch();
  batch.update(db.collection("users").doc(actor.id), {
    locale: parsed.data.locale,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "user.localeUpdated",
    entityType: "user",
    entityId: actor.id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { locale: parsed.data.locale },
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
