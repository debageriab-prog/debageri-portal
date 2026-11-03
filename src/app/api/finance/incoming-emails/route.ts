import { NextResponse } from "next/server";
import {
  INCOMING_EMAIL_STATUSES,
  isIncomingEmailStatus,
} from "@/domain/incoming-email";
import { listIncomingEmails } from "@/server/services/incoming-email-service";
import { incomingEmailContext } from "./context";

/** Stored emails, newest first; `?status=` narrows to one status. */
export async function GET(request: Request) {
  const value = await incomingEmailContext("finance.incomingEmails.view");
  if ("error" in value) return value.error;
  const status = new URL(request.url).searchParams.get("status");
  const emails = await listIncomingEmails(
    value.db,
    value.actor.organizationId,
    isIncomingEmailStatus(status) ? [status] : [...INCOMING_EMAIL_STATUSES],
  );
  return NextResponse.json({ emails });
}
