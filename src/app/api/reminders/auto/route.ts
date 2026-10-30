import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { autoRemindersSchema } from "@/server/validators/reminder";

export async function PATCH(request: Request) {
  const actor = await verifySession();
  if (!actor || !["admin", "manager", "accountant"].includes(actor.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = autoRemindersSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  const batch = db.batch();
  batch.set(
    db.collection("reminderSettings").doc(actor.organizationId),
    {
      organizationId: actor.organizationId,
      autoReminders: parsed.data.autoReminders,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    },
    { merge: true },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "reminders.auto_updated",
    entityType: "reminderSettings",
    entityId: actor.organizationId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { autoReminders: parsed.data.autoReminders },
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
