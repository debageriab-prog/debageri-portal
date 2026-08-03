import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { emailTemplateSchema } from "@/server/validators/reminder";

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = emailTemplateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the email template." },
      { status: 400 },
    );
  const { db } = getAdminServices();
  await db
    .collection("emailTemplates")
    .doc(actor.organizationId)
    .set(
      {
        organizationId: actor.organizationId,
        timeReportReminder: {
          subject: parsed.data.subject,
          template: parsed.data.template,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.id,
      },
      { merge: true },
    );
  return NextResponse.json({ ok: true });
}
