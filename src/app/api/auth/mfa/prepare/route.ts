import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";

const schema = z.object({ idToken: z.string().min(1) });

/**
 * Firebase only allows MFA enrollment for accounts with a verified email.
 * Accounts are created by administrators with a known address, so an active
 * portal user who has just signed in with their password is marked verified
 * here before enrolling an authenticator app.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const { auth, db } = getAdminServices();
    const decoded = await auth.verifyIdToken(parsed.data.idToken, true);
    const user = await db.collection("users").doc(decoded.uid).get();
    if (!user.exists || user.data()?.status !== "active")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const record = await auth.getUser(decoded.uid);
    if ((record.multiFactor?.enrolledFactors.length ?? 0) > 0)
      return NextResponse.json({ error: "alreadyEnrolled" }, { status: 409 });
    if (!record.emailVerified) {
      await auth.updateUser(decoded.uid, { emailVerified: true });
      await db.collection("auditLogs").add({
        organizationId: user.data()?.organizationId,
        actorUserId: decoded.uid,
        action: "user.mfa_enrollment_started",
        entityType: "user",
        entityId: decoded.uid,
        timestamp: FieldValue.serverTimestamp(),
        metadata: {},
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
}
