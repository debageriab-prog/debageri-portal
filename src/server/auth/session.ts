import "server-only";

import { cookies } from "next/headers";
import type { PortalUser } from "@/domain/types";
import { getAdminServices } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "__session";
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1_000;

export async function verifySession(): Promise<PortalUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const { auth, db } = getAdminServices();
    const token = await auth.verifySessionCookie(value, true);
    const snapshot = await db.collection("users").doc(token.uid).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.status !== "active") return null;
    return { id: token.uid, ...(data as Omit<PortalUser, "id">) };
  } catch {
    return null;
  }
}
