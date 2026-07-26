import type { PortalUser, UserRole } from "@/domain/types";

export function requireRole(
  user: PortalUser | null,
  roles: readonly UserRole[],
): PortalUser {
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.status !== "active") throw new Error("ACCOUNT_DISABLED");
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export function assertSameOrganization(
  actor: PortalUser,
  organizationId: string,
): void {
  if (actor.organizationId !== organizationId) throw new Error("FORBIDDEN");
}
