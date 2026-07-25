import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_DURATION_MS } from "@/server/auth/session";

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: unknown };
    if (typeof idToken !== "string")
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { auth, db } = getAdminServices();
    const decoded = await auth.verifyIdToken(idToken, true);
    const user = await db.collection("users").doc(decoded.uid).get();
    if (!user.exists || user.data()?.status !== "active") {
      return NextResponse.json(
        { error: "Account unavailable" },
        { status: 403 },
      );
    }
    const cookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1_000,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { expires: new Date(0), path: "/" });
  return response;
}
