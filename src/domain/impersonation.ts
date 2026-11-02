export const IMPERSONATION_COOKIE = "debageri-view-as";
export const IMPERSONATION_DURATION_MS = 60 * 60 * 1_000;

/** Admins can view anyone active in their organization except themselves. */
export function canImpersonate(
  actor: { id: string; organizationId: string; role: string },
  target: { id: string; organizationId: string; status: string },
) {
  return (
    actor.role === "admin" &&
    actor.id !== target.id &&
    actor.organizationId === target.organizationId &&
    target.status === "active"
  );
}

/**
 * Viewing as someone is read-only: their records stay exactly as they left
 * them and the audit log never credits them with an admin's actions. Only
 * signing in or out and leaving the view can change anything.
 */
export function isAllowedWhileImpersonating(method: string, pathname: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return pathname === "/api/admin/impersonation" && method === "DELETE";
}
