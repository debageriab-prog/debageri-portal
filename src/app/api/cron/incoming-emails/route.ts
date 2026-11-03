import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { isAuthorizedCronRequest } from "@/server/security/cron-auth";
import { financeIsEnabled } from "@/server/services/finance-service";
import {
  incomingEmailAvailability,
  organizationsWithIncomingEmail,
  readIncomingEmails,
} from "@/server/services/incoming-email-service";

/** Called by Cloud Scheduler every hour from 08:00 to 23:00 Stockholm time. */
export async function POST(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.REMINDER_CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { db, storage } = getAdminServices();
  const organizations: Record<string, unknown> = {};
  let failed = 0;
  for (const organizationId of await organizationsWithIncomingEmail(db)) {
    const availability = await incomingEmailAvailability(db, organizationId);
    if (
      !availability.mailbox ||
      !availability.ai ||
      !(await financeIsEnabled(db, organizationId))
    ) {
      organizations[organizationId] = "off";
      continue;
    }
    try {
      organizations[organizationId] = await readIncomingEmails(
        db,
        storage,
        organizationId,
        "scheduled",
        null,
      );
    } catch (error) {
      failed += 1;
      organizations[organizationId] =
        error instanceof Error ? error.message : "failed";
    }
  }
  return NextResponse.json({ organizations }, { status: failed ? 502 : 200 });
}
