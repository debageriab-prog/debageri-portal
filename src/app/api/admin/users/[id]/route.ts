import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.email(),
  employeeNumber: z.string().trim().min(1).max(30),
  role: z.enum(["employee", "consultant", "manager", "accountant", "admin"]),
  reportsTime: z.boolean(),
  status: z.enum(["active", "inactive"]),
  employmentStartDate: z.iso.date().nullable(),
  employmentEndDate: z.iso.date().nullable(),
  reportingStartDate: z.iso.date().nullable(),
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
  if (id === loaded.actor.id) {
    const current = loaded.target.data()!;
    if (
      parsed.data.employeeNumber !== current.employeeNumber ||
      parsed.data.role !== current.role ||
      parsed.data.reportsTime !==
        (current.reportsTime ??
          ["employee", "consultant"].includes(String(current.role))) ||
      parsed.data.status !== current.status
    )
      return NextResponse.json(
        { error: "You can only change your own full name and email." },
        { status: 403 },
      );
  }

  try {
    await loaded.auth.updateUser(id, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      disabled: parsed.data.status === "inactive",
    });
    await loaded.auth.setCustomUserClaims(id, {
      role: parsed.data.role,
      reportsTime:
        parsed.data.role === "consultant" ||
        parsed.data.role === "employee" ||
        (parsed.data.role === "manager" && parsed.data.reportsTime),
      organizationId: loaded.actor.organizationId,
    });
    const terms = await loaded.db
      .collection("employmentTerms")
      .where("userId", "==", id)
      .get();
    const term = terms.docs.sort((a, b) =>
      String(b.data().validFrom).localeCompare(String(a.data().validFrom)),
    )[0];
    const batch = loaded.db.batch();
    batch.update(loaded.target.ref, {
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      employeeNumber: parsed.data.employeeNumber,
      role: parsed.data.role,
      status: parsed.data.status,
      ...(parsed.data.employmentStartDate
        ? { employmentStartDate: parsed.data.employmentStartDate }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (
      term &&
      parsed.data.employmentStartDate &&
      parsed.data.reportingStartDate
    )
      batch.update(term.ref, {
        validFrom: parsed.data.employmentStartDate,
        validTo: parsed.data.employmentEndDate,
        reportingStartDate: parsed.data.reportingStartDate,
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
  if (id === loaded.actor.id)
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  const confirmation = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (confirmation?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: 'Type "I am sure" to confirm deletion.' },
      { status: 400 },
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
