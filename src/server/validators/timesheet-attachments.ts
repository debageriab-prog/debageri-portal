import { z } from "zod";
import { TIMESHEET_ATTACHMENT_REMOVAL_CONFIRMATION } from "@/domain/timesheets/attachments";

export const timesheetAttachmentRemovalSchema = z.object({
  confirmation: z.literal(TIMESHEET_ATTACHMENT_REMOVAL_CONFIRMATION),
});
