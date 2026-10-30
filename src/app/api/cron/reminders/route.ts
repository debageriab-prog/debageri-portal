import { NextResponse } from "next/server";
import { resolvePortalUrl } from "@/lib/config/portal-url";
import { isAuthorizedCronRequest } from "@/server/security/cron-auth";
import { runAutoReminders } from "@/server/services/auto-reminder-service";

/** Called by Cloud Scheduler at 09:00 and 17:00 Stockholm time on weekdays. */
export async function POST(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.REMINDER_CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const summary = await runAutoReminders(resolvePortalUrl(request.headers));
  return NextResponse.json(summary, { status: summary.failed ? 502 : 200 });
}
