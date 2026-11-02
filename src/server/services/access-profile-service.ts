import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  audienceForRole,
  normalizePermissions,
  type PermissionKey,
  type ProfileAudience,
} from "@/domain/access/permissions";
import type { PortalUser } from "@/domain/types";
import type { AccessProfileInput } from "@/server/validators/access-profile";

export class AccessProfileError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export type AccessProfile = {
  id: string;
  name: string;
  description: string;
  audience: ProfileAudience;
  permissions: PermissionKey[];
  defaultForRole: string | null;
  assignedUsers: number;
};

const profiles = (db: Firestore) => db.collection("accessProfiles");

export async function listAccessProfiles(
  db: Firestore,
  organizationId: string,
): Promise<AccessProfile[]> {
  const [profileSnapshot, users] = await Promise.all([
    profiles(db).where("organizationId", "==", organizationId).get(),
    db.collection("users").where("organizationId", "==", organizationId).get(),
  ]);
  const assigned = new Map<string, number>();
  for (const user of users.docs) {
    const id = user.data().accessProfileId;
    if (id) assigned.set(String(id), (assigned.get(String(id)) ?? 0) + 1);
  }
  return profileSnapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: String(data.name),
        description: String(data.description ?? ""),
        audience: data.audience as ProfileAudience,
        permissions: normalizePermissions(data.permissions, data.audience),
        defaultForRole: data.defaultForRole ?? null,
        assignedUsers: assigned.get(document.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function assertNameFree(
  db: Firestore,
  organizationId: string,
  name: string,
  ignoreId?: string,
) {
  const snapshot = await profiles(db)
    .where("organizationId", "==", organizationId)
    .get();
  const taken = snapshot.docs.some(
    (document) =>
      document.id !== ignoreId &&
      String(document.data().name).toLocaleLowerCase() ===
        name.toLocaleLowerCase(),
  );
  if (taken) throw new AccessProfileError("nameTaken", 409);
}

async function loadProfile(db: Firestore, actor: PortalUser, id: string) {
  const snapshot = await profiles(db).doc(id).get();
  if (
    !snapshot.exists ||
    snapshot.data()?.organizationId !== actor.organizationId
  )
    throw new AccessProfileError("notFound", 404);
  return snapshot;
}

async function assignedCount(db: Firestore, actor: PortalUser, id: string) {
  const users = await db
    .collection("users")
    .where("organizationId", "==", actor.organizationId)
    .where("accessProfileId", "==", id)
    .get();
  return users.size;
}

function audit(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  actor: PortalUser,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
) {
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType: "accessProfile",
    entityId: id,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  });
}

export async function createAccessProfile(
  db: Firestore,
  actor: PortalUser,
  input: AccessProfileInput,
) {
  await assertNameFree(db, actor.organizationId, input.name);
  const reference = profiles(db).doc();
  const permissions = normalizePermissions(input.permissions, input.audience);
  const batch = db.batch();
  batch.create(reference, {
    organizationId: actor.organizationId,
    name: input.name,
    description: input.description,
    audience: input.audience,
    permissions,
    defaultForRole: null,
    createdBy: actor.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(db, batch, actor, "accessProfile.created", reference.id, {
    name: input.name,
    audience: input.audience,
    permissions,
  });
  await batch.commit();
  return reference.id;
}

export async function updateAccessProfile(
  db: Firestore,
  actor: PortalUser,
  id: string,
  input: AccessProfileInput,
) {
  const current = await loadProfile(db, actor, id);
  await assertNameFree(db, actor.organizationId, input.name, id);
  const previous = current.data()!;
  if (
    input.audience !== previous.audience &&
    (previous.defaultForRole || (await assignedCount(db, actor, id)) > 0)
  )
    throw new AccessProfileError("audienceLocked", 409);
  const permissions = normalizePermissions(input.permissions, input.audience);
  const batch = db.batch();
  batch.update(current.ref, {
    name: input.name,
    description: input.description,
    audience: input.audience,
    permissions,
    updatedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(db, batch, actor, "accessProfile.updated", id, {
    name: input.name,
    audience: input.audience,
    permissions,
    previousPermissions: previous.permissions,
  });
  await batch.commit();
}

export async function deleteAccessProfile(
  db: Firestore,
  actor: PortalUser,
  id: string,
) {
  const current = await loadProfile(db, actor, id);
  if (current.data()?.defaultForRole)
    throw new AccessProfileError("profileDefault", 409);
  if ((await assignedCount(db, actor, id)) > 0)
    throw new AccessProfileError("profileAssigned", 409);
  const batch = db.batch();
  batch.delete(current.ref);
  audit(db, batch, actor, "accessProfile.deleted", id, {
    name: current.data()?.name,
    permissions: current.data()?.permissions,
  });
  await batch.commit();
}

/** Admins hold no profile; everyone else needs one from their organization. */
export async function assertProfileFitsRole(
  db: Firestore,
  organizationId: string,
  role: string,
  profileId: string | null,
) {
  const audience = audienceForRole(role);
  if (!audience) {
    if (profileId) throw new AccessProfileError("profileInvalid");
    return;
  }
  if (!profileId) throw new AccessProfileError("profileRequired");
  const profile = await profiles(db).doc(profileId).get();
  if (
    !profile.exists ||
    profile.data()?.organizationId !== organizationId ||
    profile.data()?.audience !== audience
  )
    throw new AccessProfileError("profileInvalid");
}
