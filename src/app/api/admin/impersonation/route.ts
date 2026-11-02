import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canImpersonate,
  IMPERSONATION_COOKIE,
  IMPERSONATION_DURATION_MS,
} from "@/domain/impersonation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const startSchema = z.object({
  userId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^/]+$/),
});

/** Starts a read-only view of a user for the signed-in admin. */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (actor.role !== "admin" || actor.impersonatedBy)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });

  const { db } = getAdminServices();
  const { userId } = parsed.data;
  const target = await db.collection("users").doc(userId).get();
  if (!target.exists)
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (
    !canImpersonate(actor, {
      id: userId,
      organizationId: String(target.data()?.organizationId),
      status: String(target.data()?.status),
    })
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db.collection("auditLogs").add({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "user.impersonation_started",
    entityType: "user",
    entityId: userId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {},
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: IMPERSONATION_DURATION_MS / 1_000,
    path: "/",
  });
  return response;
}

/** Ends the view and hands the browser back to the admin. */
export async function DELETE() {
  const actor = await verifySession();
  if (actor?.impersonatedBy)
    await getAdminServices().db.collection("auditLogs").add({
      organizationId: actor.organizationId,
      actorUserId: actor.impersonatedBy.id,
      action: "user.impersonation_ended",
      entityType: "user",
      entityId: actor.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATION_COOKIE, "", {
    expires: new Date(0),
    path: "/",
  });
  return response;
}
