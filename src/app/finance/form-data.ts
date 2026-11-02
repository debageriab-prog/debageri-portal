import "server-only";

import { redirect } from "next/navigation";
import {
  can,
  hasOrganizationFinance,
  type PermissionKey,
} from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

export async function financeFormContext(permission: PermissionKey) {
  const actor = await verifySession();
  if (!actor) redirect("/auth/login");
  if (!can(actor, permission)) redirect("/unauthorized");
  return { actor, db: getAdminServices().db };
}

export async function financeUsers() {
  const actor = await verifySession();
  if (!actor) redirect("/auth/login");
  if (!hasOrganizationFinance(actor)) redirect("/unauthorized");
  const { db } = getAdminServices();
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
