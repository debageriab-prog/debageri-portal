import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const schema = z.object({
  password: z.string().min(8).max(128),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return Response.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await context.params;
  if (id === actor.id)
    return Response.json(
      { error: "Change your own password from the account menu." },
      { status: 409 },
    );

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Use a password with at least 8 characters." },
      { status: 400 },
    );

  const { auth, db } = getAdminServices();
  const target = await db.collection("users").doc(id).get();
  if (!target.exists)
    return Response.json({ error: "User not found." }, { status: 404 });
  if (target.data()?.organizationId !== actor.organizationId)
    return Response.json({ error: "Forbidden." }, { status: 403 });

  try {
    await auth.updateUser(id, { password: parsed.data.password });
    await auth.revokeRefreshTokens(id);
    await db.collection("auditLogs").add({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "The password could not be changed. Please try again." },
      { status: 500 },
    );
  }
}
