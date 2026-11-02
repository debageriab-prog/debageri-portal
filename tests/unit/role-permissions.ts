import {
  DEFAULT_PROFILES,
  resolvePermissions,
  type PermissionKey,
} from "@/domain/access/permissions";

/** What an admin holds, or what the default profile for a role grants. */
export function rolePermissions(role: string): PermissionKey[] {
  if (role === "admin")
    return resolvePermissions({ role, organizationId: "org" }, null);
  const profile = DEFAULT_PROFILES.find(
    (candidate) => candidate.defaultForRole === role,
  );
  return profile ? [...profile.permissions] : [];
}
