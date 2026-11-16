import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  COMPANY_GROUP_ID,
  membershipIds,
  normalizeGroupIds,
  type UserGroupStatus,
} from "@/domain/access/groups";
import type { PortalUser } from "@/domain/types";
import type { UserGroupInput } from "@/server/validators/user-group";

export class UserGroupError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export type UserGroup = {
  id: string;
  name: string;
  description: string;
  status: UserGroupStatus;
  members: number;
};

const groups = (db: Firestore) => db.collection("userGroups");

export async function listUserGroups(
  db: Firestore,
  organizationId: string,
): Promise<UserGroup[]> {
  const [snapshot, users] = await Promise.all([
    groups(db).where("organizationId", "==", organizationId).get(),
    db.collection("users").where("organizationId", "==", organizationId).get(),
  ]);
  const members = new Map<string, number>();
  for (const user of users.docs)
    for (const id of membershipIds(user.data().groupIds))
      members.set(id, (members.get(id) ?? 0) + 1);
  return snapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        name: String(data.name),
        description: String(data.description ?? ""),
        status: (data.status === "disabled"
          ? "disabled"
          : "active") as UserGroupStatus,
        members: members.get(document.id) ?? 0,
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
  const snapshot = await groups(db)
    .where("organizationId", "==", organizationId)
    .get();
  const taken = snapshot.docs.some(
    (document) =>
      document.id !== ignoreId &&
      String(document.data().name).toLocaleLowerCase() ===
        name.toLocaleLowerCase(),
  );
  if (taken) throw new UserGroupError("nameTaken", 409);
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
    entityType: "userGroup",
    entityId: id,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  });
}

export async function createUserGroup(
  db: Firestore,
  actor: PortalUser,
  input: UserGroupInput,
) {
  await assertNameFree(db, actor.organizationId, input.name);
  const reference = groups(db).doc();
  const batch = db.batch();
  batch.create(reference, {
    organizationId: actor.organizationId,
    name: input.name,
    description: input.description,
    status: input.status,
    createdBy: actor.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(db, batch, actor, "userGroup.created", reference.id, { ...input });
  await batch.commit();
  return reference.id;
}

export async function updateUserGroup(
  db: Firestore,
  actor: PortalUser,
  id: string,
  input: UserGroupInput,
) {
  if (id === COMPANY_GROUP_ID) throw new UserGroupError("groupLocked", 409);
  const current = await groups(db).doc(id).get();
  if (
    !current.exists ||
    current.data()?.organizationId !== actor.organizationId
  )
    throw new UserGroupError("notFound", 404);
  await assertNameFree(db, actor.organizationId, input.name, id);
  const previous = current.data()!;
  const previousStatus = previous.status === "disabled" ? "disabled" : "active";
  const batch = db.batch();
  batch.update(current.ref, {
    name: input.name,
    description: input.description,
    status: input.status,
    updatedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(
    db,
    batch,
    actor,
    input.status === previousStatus
      ? "userGroup.updated"
      : input.status === "disabled"
        ? "userGroup.disabled"
        : "userGroup.enabled",
    id,
    { ...input, previousName: previous.name, previousStatus },
  );
  await batch.commit();
}

/**
 * Keeps only groups of the organization. Disabled groups stay allowed so a
 * saved membership or profile survives a group being switched off and on.
 */
export async function existingGroupIds(
  db: Firestore,
  organizationId: string,
  ids: readonly string[],
  { allowCompany }: { allowCompany: boolean },
) {
  const wanted = normalizeGroupIds(ids);
  if (wanted.length === 0) return wanted;
  const snapshot = await groups(db)
    .where("organizationId", "==", organizationId)
    .get();
  const known = new Set(snapshot.docs.map((document) => document.id));
  if (allowCompany) known.add(COMPANY_GROUP_ID);
  if (wanted.some((id) => !known.has(id)))
    throw new UserGroupError("groupInvalid");
  return wanted;
}
