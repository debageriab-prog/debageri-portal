import "server-only";

import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

export async function financeFormContext(adminOnly = false) {
  const actor = await verifySession();
  if (!actor) redirect("/auth/login");
  if (
    adminOnly
      ? actor.role !== "admin"
      : !["admin", "accountant"].includes(actor.role)
  )
    redirect("/unauthorized");
  return { actor, db: getAdminServices().db };
}

export async function financeUsers() {
  const { actor, db } = await financeFormContext();
  const snapshot = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .get();
  return snapshot.docs
    .map((document) => ({
      id: document.id,
      displayName: String(document.data().displayName),
      role: document.data().role as string,
    }))
    .filter((user) => user.role === "consultant")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
