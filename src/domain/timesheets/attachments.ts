import type { UserRole } from "@/domain/types";
import { canReview } from "@/domain/timesheets/rules";

export const TIMESHEET_ATTACHMENT_MAX_FILES = 3;
/** Stays below the 10 MB request body limit of the API proxy. */
export const TIMESHEET_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const TIMESHEET_ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const TIMESHEET_ATTACHMENT_REMOVAL_CONFIRMATION = "I am sure";

export function timesheetAttachmentFileError(file: {
  size: number;
  type: string;
}) {
  if (file.size === 0) return "attachmentRequired";
  if (file.size > TIMESHEET_ATTACHMENT_MAX_BYTES) return "attachmentTooLarge";
  if (
    !(TIMESHEET_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(
      file.type,
    )
  )
    return "attachmentType";
  return null;
}

/**
 * The person who reported the time adds and views files. Only someone who may
 * review the report removes them, so a manager's own report needs an admin.
 */
export function timesheetAttachmentAccess(
  actor: { id: string; role: UserRole; organizationId: string },
  ownerId: string,
  owner: { role: UserRole; reportsTime: boolean; organizationId: string },
) {
  const own = actor.id === ownerId;
  const canRemove = !own && canReview(actor, owner);
  const accountant =
    actor.role === "accountant" &&
    actor.organizationId === owner.organizationId &&
    ["employee", "consultant"].includes(owner.role);
  return {
    canAdd: own,
    canRemove,
    canView: own || canRemove || accountant,
  };
}
