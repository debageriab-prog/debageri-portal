/**
 * Employee groups decide whose data a staff member can reach. A staff access
 * profile either manages all employees or a set of groups; the built-in
 * company group stands for records that belong to no employee.
 */

/** Always exists, cannot be renamed, disabled or joined by anyone. */
export const COMPANY_GROUP_ID = "company";

export type UserGroupStatus = "active" | "disabled";
export type ProfileScope = "all" | "groups";

export type AccessScope = {
  scope: ProfileScope;
  /** Managed group ids; may include `COMPANY_GROUP_ID`. */
  groupIds: string[];
};

export const FULL_SCOPE: AccessScope = { scope: "all", groupIds: [] };
export const NO_SCOPE: AccessScope = { scope: "groups", groupIds: [] };

/** Whose records someone can reach, resolved against current memberships. */
export type Reach =
  | { all: true }
  | { all: false; company: boolean; userIds: ReadonlySet<string> };

export const FULL_REACH: Reach = { all: true };

const MAX_GROUPS = 200;

/** Unique, non-empty string ids, in their first order. */
export function normalizeGroupIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 200);
  return [...new Set(ids)].slice(0, MAX_GROUPS);
}

/** Group ids an employee can belong to: never the company group. */
export function membershipIds(value: unknown): string[] {
  return normalizeGroupIds(value).filter((id) => id !== COMPANY_GROUP_ID);
}

/**
 * Profiles saved before groups existed manage all employees, so nothing
 * changes until an admin narrows them.
 */
export function scopeFromProfile(profile: {
  scope?: unknown;
  groupIds?: unknown;
}): AccessScope {
  return profile.scope === "groups"
    ? { scope: "groups", groupIds: normalizeGroupIds(profile.groupIds) }
    : FULL_SCOPE;
}

/**
 * Disabled groups grant nothing, neither through the profile nor through
 * membership, so an employee only in disabled groups counts as ungrouped.
 */
export function reachFrom(
  scope: AccessScope,
  activeGroupIds: ReadonlySet<string>,
  users: ReadonlyArray<{ id: string; groupIds?: unknown }>,
): Reach {
  if (scope.scope === "all") return FULL_REACH;
  const managed = new Set(
    scope.groupIds.filter(
      (id) => id !== COMPANY_GROUP_ID && activeGroupIds.has(id),
    ),
  );
  const userIds = new Set(
    users
      .filter((user) =>
        membershipIds(user.groupIds).some((id) => managed.has(id)),
      )
      .map((user) => user.id),
  );
  return {
    all: false,
    company: scope.groupIds.includes(COMPANY_GROUP_ID),
    userIds,
  };
}

/** True when the scope covers records that belong to no employee. */
export function scopeReachesCompany(scope: AccessScope | undefined): boolean {
  return (
    !scope || scope.scope === "all" || scope.groupIds.includes(COMPANY_GROUP_ID)
  );
}

export function reachesUser(
  reach: Reach,
  userId: string | null | undefined,
): boolean {
  if (reach.all) return true;
  return Boolean(userId) && reach.userIds.has(userId!);
}

export function reachesCompany(reach: Reach): boolean {
  return reach.all || reach.company;
}

/**
 * A record tied to an employee needs that employee; one tied to nobody needs
 * the company group.
 */
export function reachesRecord(
  reach: Reach,
  ownerId: string | null | undefined,
): boolean {
  return ownerId ? reachesUser(reach, ownerId) : reachesCompany(reach);
}
