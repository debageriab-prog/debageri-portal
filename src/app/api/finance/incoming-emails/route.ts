import { NextResponse } from "next/server";
import {
  INCOMING_EMAIL_STATUSES,
  isIncomingEmailStatus,
} from "@/domain/incoming-email";
import { isMonth, shiftMonth, stockholmMonthStart } from "@/lib/dates/month";
import { listIncomingEmails } from "@/server/services/incoming-email-service";
import { incomingEmailContext } from "./context";

/**
 * Stored emails, newest first. `?status=` narrows to one status and
 * `?month=YYYY-MM` to emails received that Stockholm month.
 */
export async function GET(request: Request) {
  const value = await incomingEmailContext("finance.incomingEmails.view");
  if ("error" in value) return value.error;
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const month = params.get("month");
  const emails = await listIncomingEmails(
    value.db,
    value.actor.organizationId,
    isIncomingEmailStatus(status) ? [status] : [...INCOMING_EMAIL_STATUSES],
    isMonth(month)
      ? {
          from: stockholmMonthStart(month),
          to: stockholmMonthStart(shiftMonth(month, 1)),
        }
      : undefined,
  );
  return NextResponse.json({ emails });
}
