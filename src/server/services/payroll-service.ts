import "server-only";

import {
  FieldValue,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore";
import {
  emptyPayrollProfile,
  payrollProfileFrom,
  payrollProfileId,
  type PayrollProfile,
} from "@/domain/salary/payroll-profile";
import type { PayrollProfileInput } from "@/server/validators/payroll";

/** The person's payroll details, or empty defaults when none are stored. */
export async function loadPayrollProfile(
  db: Firestore,
  organizationId: string,
  userId: string,
): Promise<PayrollProfile> {
  const snapshot = await db
    .collection("payrollProfiles")
    .doc(payrollProfileId(organizationId, userId))
    .get();
  if (!snapshot.exists || snapshot.data()?.organizationId !== organizationId)
    return emptyPayrollProfile();
  return payrollProfileFrom(snapshot.data());
}

/**
 * Adds the payroll details to a batch, with an audit entry naming the fields
 * that changed. Values stay out of the audit log: they are personal data.
 */
export function writePayrollProfile(
  db: Firestore,
  batch: WriteBatch,
  context: { organizationId: string; actorId: string; userId: string },
  previous: PayrollProfile,
  input: PayrollProfileInput,
) {
  const next = payrollProfileFrom(input);
  const changed = (Object.keys(next) as Array<keyof PayrollProfile>).filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]),
  );
  if (!changed.length) return;
  batch.set(
    db
      .collection("payrollProfiles")
      .doc(payrollProfileId(context.organizationId, context.userId)),
    {
      ...next,
      organizationId: context.organizationId,
      userId: context.userId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: context.actorId,
    },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: context.organizationId,
    actorUserId: context.actorId,
    action: "payrollProfile.updated",
    entityType: "user",
    entityId: context.userId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { fields: changed },
  });
}
