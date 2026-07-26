import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { PortalUser, Timesheet, TimesheetStatus } from "@/domain/types";
import {
  assertTransition,
  calculateTotals,
  canReview,
} from "@/domain/timesheets/rules";
import { getAdminServices } from "@/lib/firebase/admin";

export async function transitionTimesheet(
  actor: PortalUser,
  timesheetId: string,
  toStatus: TimesheetStatus,
  comment: string | null,
): Promise<Timesheet> {
  const { db } = getAdminServices();
  return db.runTransaction(async (transaction) => {
    const ref = db.collection("timesheets").doc(timesheetId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("NOT_FOUND");
    const sheet = { id: snapshot.id, ...snapshot.data() } as Timesheet;
    if (sheet.organizationId !== actor.organizationId)
      throw new Error("FORBIDDEN");
    const employeeAction =
      toStatus === "submitted" && sheet.userId === actor.id;
    const reviewerAction =
      ["approved", "rejected", "reopened"].includes(toStatus) &&
      canReview(actor, sheet);
    if (!employeeAction && !reviewerAction) throw new Error("FORBIDDEN");
    assertTransition(sheet.status, toStatus);
    if (toStatus === "rejected" && (!comment || comment.trim().length < 3))
      throw new Error("REASON_REQUIRED");
    const entriesQuery = db
      .collection("timeEntries")
      .where("timesheetId", "==", sheet.id);
    const entries = (await transaction.get(entriesQuery)).docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const totals = calculateTotals(entries as never[], sheet.expectedMinutes);
    const version = sheet.version + 1;
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, {
      ...totals,
      status: toStatus,
      version,
      rejectionReason: toStatus === "rejected" ? comment : null,
      updatedAt: now,
      ...(toStatus === "submitted"
        ? { submittedAt: now, submittedBy: actor.id }
        : {}),
      ...(["approved", "rejected"].includes(toStatus)
        ? { reviewedAt: now, reviewedBy: actor.id }
        : {}),
    });
    const action =
      sheet.status === "rejected" && toStatus === "submitted"
        ? "resubmitted"
        : toStatus;
    transaction.create(db.collection("approvalEvents").doc(), {
      organizationId: sheet.organizationId,
      timesheetId: sheet.id,
      userId: sheet.userId,
      action,
      fromStatus: sheet.status,
      toStatus,
      comment,
      performedBy: actor.id,
      performedAt: now,
      timesheetVersion: version,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: sheet.organizationId,
      actorUserId: actor.id,
      action: `timesheet.${action}`,
      entityType: "timesheet",
      entityId: sheet.id,
      timestamp: now,
      metadata: { fromStatus: sheet.status, toStatus, version },
    });
    return { ...sheet, ...totals, status: toStatus, version };
  });
}
