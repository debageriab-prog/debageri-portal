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
  const input = parsed.data;
  const { db } = getAdminServices();
  const content =
    input.templateId === "time-report-reminder"
      ? {
          timeReportReminder: {
            subject: input.subject,
            template: input.template,
          },
        }
      : {
          notifications: {
            [input.templateId]: {
              [input.locale]:
                "reset" in input
                  ? FieldValue.delete()
                  : { subject: input.subject, body: input.template },
            },
          },
        };
  await db
    .collection("emailTemplates")
    .doc(actor.organizationId)
    .set(
      {
        organizationId: actor.organizationId,
        ...content,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.id,
      },
      { merge: true },
    );
  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "reset" in input ? "emailTemplate.reset" : "emailTemplate.updated",
    entityType: "emailTemplate",
    entityId: input.templateId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: "locale" in input ? { locale: input.locale } : {},
  });
  return NextResponse.json({ ok: true });
}
