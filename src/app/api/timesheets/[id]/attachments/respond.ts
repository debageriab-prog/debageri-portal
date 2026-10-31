import { NextResponse } from "next/server";
import { TimesheetAttachmentError } from "@/server/services/timesheet-attachment-service";

export function attachmentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TimesheetAttachmentError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  console.error("Timesheet attachment request failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
