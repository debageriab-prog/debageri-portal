import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import {
  resolvePermissions,
  type StoredProfile,
} from "@/domain/access/permissions";

type UserData = Parameters<typeof resolvePermissions>[0];

export async function permissionsOf(db: Firestore, user: UserData) {
  if (user.role === "admin" || !user.accessProfileId)
    return resolvePermissions(user, null);
  const profile = await db
    .collection("accessProfiles")
    .doc(user.accessProfileId)
    .get();
  return resolvePermissions(
    user,
    profile.exists ? (profile.data() as StoredProfile) : null,
  );
}

/** Resolves many users of one organization with a single profile read. */
export async function permissionResolver(
  db: Firestore,
  organizationId: string,
) {
  const snapshot = await db
    .collection("accessProfiles")
    .where("organizationId", "==", organizationId)
    .get();
  const profiles = new Map(
    snapshot.docs.map((document) => [
      document.id,
      document.data() as StoredProfile,
    ]),
  );
  return (user: UserData) =>
    resolvePermissions(user, profiles.get(user.accessProfileId ?? "") ?? null);
}
