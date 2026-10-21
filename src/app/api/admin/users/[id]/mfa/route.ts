import { FieldValue } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

/** Removes a user's enrolled second factors so they enroll again at sign-in. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return Response.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await context.params;
  if (id === actor.id)
    return Response.json(
      { error: "Ask another administrator to reset your two-factor login." },
      { status: 409 },
    );

  const { auth, db } = getAdminServices();
  const target = await db.collection("users").doc(id).get();
  if (!target.exists)
    return Response.json({ error: "User not found." }, { status: 404 });
  if (target.data()?.organizationId !== actor.organizationId)
    return Response.json({ error: "Forbidden." }, { status: 403 });

  try {
    await auth.updateUser(id, { multiFactor: { enrolledFactors: null } });
    await auth.revokeRefreshTokens(id);
    await db.collection("auditLogs").add({
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "user.mfa_reset",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Two-factor login could not be reset. Please try again." },
      { status: 500 },
    );
  }
}
