import {
  audienceForRole,
  DEFAULT_PROFILES,
  legacyPermissions,
  resolvePermissions,
  type PermissionKey,
  type ProfileAudience,
} from "@/domain/access/permissions";
import type { DocumentAccess, FinanceAccess } from "@/domain/types";

export type BackfillUser = {
  id: string;
  role: string;
  organizationId: string;
  accessProfileId?: string | null;
  financeAccess?: Partial<FinanceAccess> | null;
  documentAccess?: Partial<DocumentAccess> | null;
};
export type BackfillProfile = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  audience: ProfileAudience;
  permissions: PermissionKey[];
  defaultForRole: string | null;
};
export type BackfillPlan = {
  newProfiles: BackfillProfile[];
  assignments: Array<{ userId: string; profileId: string }>;
};

const baseNames: Record<string, string> = {
  manager: "Manager",
  accountant: "Accountant",
  consultant: "Consultant",
  employee: "Consultant",
};
const ownAccessNames: Partial<Record<PermissionKey, string>> = {
  "my.finance": "my finances",
  "my.invoices": "my invoices",
  "my.contracts": "contracts",
  "my.payslips": "pay slips",
  "my.receipts": "receipts",
};

const sameKeys = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  [...left].sort().join() === [...right].sort().join();

export const defaultProfileId = (organizationId: string, role: string) =>
  `${organizationId}_default_${role}`;

export function defaultProfilesFor(organizationId: string): BackfillProfile[] {
  return DEFAULT_PROFILES.map((profile) => ({
    id: defaultProfileId(organizationId, profile.defaultForRole),
    organizationId,
    name: profile.name,
    description: "",
    audience: profile.audience,
    permissions: [...profile.permissions],
    defaultForRole: profile.defaultForRole,
  }));
}

/**
 * Keeps everyone on exactly what they can do today: each user without a profile
 * joins an existing profile with the same permissions, or a new one made for
 * that combination of flags. Throws rather than plan a change of access.
 */
export function planBackfill(
  organizationId: string,
  users: readonly BackfillUser[],
  existing: readonly BackfillProfile[],
): BackfillPlan {
  const defaults = defaultProfilesFor(organizationId).filter(
    (profile) => !existing.some((item) => item.id === profile.id),
  );
  const known = [...existing, ...defaults];
  const newProfiles = [...defaults];
  const assignments: BackfillPlan["assignments"] = [];

  for (const user of users) {
    const audience = audienceForRole(user.role);
    if (!audience || user.accessProfileId) continue;
    const permissions = legacyPermissions(
      user.role,
      user.financeAccess,
      user.documentAccess,
    );
    let profile = known.find(
      (item) =>
        item.audience === audience && sameKeys(item.permissions, permissions),
    );
    if (!profile) {
      const own = permissions.flatMap((key) => ownAccessNames[key] ?? []);
      profile = {
        id: `${organizationId}_migrated_${audience}_${known.length}`,
        organizationId,
        name: `${baseNames[user.role]}: ${own.join(", ") || "no own data"}`,
        description: "",
        audience,
        permissions,
        defaultForRole: null,
      };
      known.push(profile);
      newProfiles.push(profile);
    }
    const resolved = resolvePermissions(
      { ...user, accessProfileId: profile.id },
      profile,
    );
    if (!sameKeys(resolved, permissions))
      throw new Error(`Backfill would change access for user ${user.id}`);
    assignments.push({ userId: user.id, profileId: profile.id });
  }
  return { newProfiles, assignments };
}
