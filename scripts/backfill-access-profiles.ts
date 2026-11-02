/**
 * Moves users from the old access flags to access profiles without changing
 * what anyone can do. Dry run by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-access-profiles.ts
 *   npx tsx --env-file=.env.local scripts/backfill-access-profiles.ts --apply
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type WriteBatch,
} from "firebase-admin/firestore";
import {
  planBackfill,
  type BackfillProfile,
  type BackfillUser,
} from "@/domain/access/backfill";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
if (!projectId || /^debageri-web(?:-|$)/i.test(projectId))
  throw new Error(`Unsafe Firebase project: ${projectId ?? "missing"}`);
const apply = process.argv.includes("--apply");

initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const BATCH_SIZE = 200;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let start = 0; start < writes.length; start += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(start, start + BATCH_SIZE).forEach((write) => write(batch));
    await batch.commit();
  }
}

async function backfill(organizationId: string) {
  const [users, profiles] = await Promise.all([
    db.collection("users").where("organizationId", "==", organizationId).get(),
    db
      .collection("accessProfiles")
      .where("organizationId", "==", organizationId)
      .get(),
  ]);
  const plan = planBackfill(
    organizationId,
    users.docs.map(
      (document) => ({ id: document.id, ...document.data() }) as BackfillUser,
    ),
    profiles.docs.map(
      (document) =>
        ({ id: document.id, ...document.data() }) as BackfillProfile,
    ),
  );
  console.log(`${organizationId} on ${projectId}:`);
  for (const profile of plan.newProfiles)
    console.log(
      `  create profile "${profile.name}" (${profile.audience}, ${profile.permissions.length} permissions)`,
    );
  console.log(`  assign ${plan.assignments.length} users`);
  if (!apply) return;

  const writes: Array<(batch: WriteBatch) => void> = [];
  for (const { id, ...profile } of plan.newProfiles)
    writes.push((batch) =>
      batch.create(db.collection("accessProfiles").doc(id), {
        ...profile,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  for (const { userId, profileId } of plan.assignments)
    writes.push((batch) => {
      batch.update(db.collection("users").doc(userId), {
        accessProfileId: profileId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.create(db.collection("auditLogs").doc(), {
        organizationId,
        actorUserId: "system",
        action: "user.access_profile_backfilled",
        entityType: "user",
        entityId: userId,
        timestamp: FieldValue.serverTimestamp(),
        metadata: { accessProfileId: profileId },
      });
    });
  await commitInChunks(writes);
}

async function main() {
  const organizations = await db.collection("organizations").get();
  for (const organization of organizations.docs)
    await backfill(organization.id);
  console.log(apply ? "Done." : "Dry run only. Pass --apply to write.");
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
