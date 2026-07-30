import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { reminderSettingsSchema } from "@/server/validators/reminder";
import {
  defaultReminderSubject,
  defaultReminderTemplate,
  encryptPassword,
} from "@/server/services/reminder-service";

export async function GET() {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { db } = getAdminServices();
  const doc = await db
    .collection("reminderSettings")
    .doc(actor.organizationId)
    .get();
  const data = doc.data();
  return NextResponse.json({
    smtpHost: data?.smtpHost ?? "",
    smtpPort: data?.smtpPort ?? 587,
    smtpSecure: data?.smtpSecure ?? false,
    smtpUsername: data?.smtpUsername ?? "",
    passwordConfigured: Boolean(data?.encryptedPassword),
    fromEmail: data?.fromEmail ?? "",
    senderName: data?.senderName ?? "",
    subject: data?.subject ?? defaultReminderSubject,
    template: data?.template ?? defaultReminderTemplate,
  });
}

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = reminderSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the SMTP and template settings." },
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
