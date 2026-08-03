import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { emailSettingsSchema } from "@/server/validators/reminder";
import { encryptPassword } from "@/server/services/reminder-service";

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = emailSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the email connection settings." },
      { status: 400 },
    );
  const { db } = getAdminServices();
  const ref = db.collection("reminderSettings").doc(actor.organizationId);
  const existing = await ref.get();
  if (!parsed.data.password && !existing.data()?.encryptedPassword)
    return NextResponse.json(
      { error: "Enter the sender email password." },
      { status: 400 },
    );
  const { password, ...settings } = parsed.data;
  await ref.set(
    {
      organizationId: actor.organizationId,
      ...settings,
      ...(password ? { encryptedPassword: encryptPassword(password) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}
