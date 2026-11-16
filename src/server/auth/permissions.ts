import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import {
  resolvePermissions,
  resolveScope,
  type StoredProfile,
} from "@/domain/access/permissions";

type UserData = Parameters<typeof resolvePermissions>[0];

async function profileOf(db: Firestore, user: UserData) {
  if (user.role === "admin" || !user.accessProfileId) return null;
  const profile = await db
    .collection("accessProfiles")
    .doc(user.accessProfileId)
    .get();
  return profile.exists ? (profile.data() as StoredProfile) : null;
}

export async function permissionsOf(db: Firestore, user: UserData) {
  return resolvePermissions(user, await profileOf(db, user));
}

/** Permissions and managed-group scope from one profile read. */
export async function accessOf(db: Firestore, user: UserData) {
  const profile = await profileOf(db, user);
  return {
    permissions: resolvePermissions(user, profile),
    accessScope: resolveScope(user, profile),
  };
}

async function profilesOf(db: Firestore, organizationId: string) {
  const snapshot = await db
    .collection("accessProfiles")
    .where("organizationId", "==", organizationId)
    .get();
  return new Map(
    snapshot.docs.map((document) => [
      document.id,
      document.data() as StoredProfile,
    ]),
  );
}

/** Resolves many users of one organization with a single profile read. */
export async function permissionResolver(
  db: Firestore,
  organizationId: string,
) {
  const profiles = await profilesOf(db, organizationId);
  return (user: UserData) =>
    resolvePermissions(user, profiles.get(user.accessProfileId ?? "") ?? null);
}

/** Like `permissionResolver`, for the managed-group scope. */
export async function scopeResolver(db: Firestore, organizationId: string) {
  const profiles = await profilesOf(db, organizationId);
  return (user: UserData) =>
    resolveScope(user, profiles.get(user.accessProfileId ?? "") ?? null);
}
