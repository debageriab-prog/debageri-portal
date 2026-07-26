import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.email(),
  employeeNumber: z.string().trim().min(1).max(30),
  role: z.enum(["employee", "manager", "admin"]),
  status: z.enum(["active", "inactive"]),
});

async function loadTarget(id: string) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin") return { error: "FORBIDDEN" as const };
  const { auth, db } = getAdminServices();
  const target = await db.collection("users").doc(id).get();
  if (!target.exists) return { error: "NOT_FOUND" as const };
  if (target.data()?.organizationId !== actor.organizationId)
    return { error: "FORBIDDEN" as const };
  return { actor, auth, db, target };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await loadTarget(id);
  if ("error" in loaded)
    return NextResponse.json(
      {
        error: loaded.error === "NOT_FOUND" ? "User not found." : "Forbidden.",
      },
      { status: loaded.error === "NOT_FOUND" ? 404 : 403 },
    );
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the employee details and try again." },
      { status: 400 },
    );

  try {
    await loaded.auth.updateUser(id, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      disabled: parsed.data.status === "inactive",
    });
    await loaded.auth.setCustomUserClaims(id, {
      role: parsed.data.role,
      organizationId: loaded.actor.organizationId,
    });
    const batch = loaded.db.batch();
    batch.update(loaded.target.ref, {
      ...parsed.data,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(loaded.db.collection("auditLogs").doc(), {
      organizationId: loaded.actor.organizationId,
      actorUserId: loaded.actor.id,
      action: "user.updated",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { role: parsed.data.role, status: parsed.data.status },
    });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    return NextResponse.json(
      {
        error:
          code === "auth/email-already-exists"
            ? "That email address is already used by another account."
            : "The employee could not be updated. Please try again.",
      },
      { status: code === "auth/email-already-exists" ? 409 : 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await loadTarget(id);
  if ("error" in loaded)
    return NextResponse.json(
      {
        error: loaded.error === "NOT_FOUND" ? "User not found." : "Forbidden.",
      },
      { status: loaded.error === "NOT_FOUND" ? 404 : 403 },
    );
  if (id === loaded.actor.id)
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );

  try {
    const terms = await loaded.db
      .collection("employmentTerms")
      .where("userId", "==", id)
      .get();
    const batch = loaded.db.batch();
    terms.docs.forEach((term) => batch.delete(term.ref));
    batch.delete(loaded.target.ref);
    batch.create(loaded.db.collection("auditLogs").doc(), {
      organizationId: loaded.actor.organizationId,
      actorUserId: loaded.actor.id,
      action: "user.deleted",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    await batch.commit();
    await loaded.auth.deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "The employee could not be deleted. Please try again." },
      { status: 500 },
    );
  }
}
