import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { cache } from "react";
import {
  FULL_REACH,
  reachFrom,
  reachesCompany,
  reachesRecord,
  reachesUser,
  type AccessScope,
  type Reach,
} from "@/domain/access/groups";
import { scopeResolver } from "@/server/auth/permissions";

type Actor = {
  id: string;
  organizationId: string;
  accessScope?: AccessScope;
};

async function membershipData(db: Firestore, organizationId: string) {
  const [groups, users] = await Promise.all([
    db
      .collection("userGroups")
      .where("organizationId", "==", organizationId)
      .get(),
    db.collection("users").where("organizationId", "==", organizationId).get(),
  ]);
  return {
    activeGroupIds: new Set(
      groups.docs
        .filter((group) => group.data().status !== "disabled")
        .map((group) => group.id),
    ),
    users: users.docs.map((user) => ({
      id: user.id,
      groupIds: user.data().groupIds,
    })),
  };
}

const membershipsOf = cache(membershipData);

/**
 * Whose records the actor's company permissions reach. An actor without a
 * resolved scope (a system job) reaches everyone.
 */
export const reachOf = cache(async function reachOf(
  db: Firestore,
  actor: Actor,
): Promise<Reach> {
  if (!actor.accessScope || actor.accessScope.scope === "all")
    return FULL_REACH;
  const { activeGroupIds, users } = await membershipsOf(
    db,
    actor.organizationId,
  );
  return reachFrom(actor.accessScope, activeGroupIds, users);
});

/** Resolves the reach of many people of one organization, for notifications. */
export async function reachResolver(db: Firestore, organizationId: string) {
  const [scopeFor, { activeGroupIds, users }] = await Promise.all([
    scopeResolver(db, organizationId),
    membershipData(db, organizationId),
  ]);
  return (user: Parameters<typeof scopeFor>[0]) =>
    reachFrom(scopeFor(user), activeGroupIds, users);
}

export class OutOfReachError extends Error {
  constructor() {
    super("FORBIDDEN");
  }
}

/** Throws unless the actor reaches the employee. */
export async function assertReachesUser(
  db: Firestore,
  actor: Actor,
  userId: string | null | undefined,
) {
  if (!reachesUser(await reachOf(db, actor), userId))
    throw new OutOfReachError();
}

/** Throws unless the actor reaches a record owned by `ownerId` (or nobody). */
export async function assertReachesRecord(
  db: Firestore,
  actor: Actor,
  ownerId: string | null | undefined,
) {
  if (!reachesRecord(await reachOf(db, actor), ownerId))
    throw new OutOfReachError();
}

export { reachesCompany, reachesRecord, reachesUser };
