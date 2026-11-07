import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { isAuthorizedCronRequest } from "@/server/security/cron-auth";
import { renewAllVacations } from "@/server/services/vacation-service";

const bodySchema = z.object({ date: z.iso.date().optional() }).nullable();

/**
 * Called by Cloud Scheduler once a day. Starts every vacation period that is
 * due, granting pro-rated days and carrying leftover days into saved days.
 * Outside production a `date` in the body stands in for today, for testing.
 */
export async function POST(request: Request) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      process.env.REMINDER_CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const today =
    process.env.NODE_ENV !== "production" && body.success && body.data?.date
      ? body.data.date
      : stockholmDateTime().date;
  const { db } = getAdminServices();
  const { organizations, failed } = await renewAllVacations(db, today);
  return NextResponse.json(
    { today, organizations },
    { status: failed ? 502 : 200 },
  );
}
