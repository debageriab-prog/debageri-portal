import { NextResponse } from "next/server";
import type { TimesheetStatus } from "@/domain/types";
import { verifySession } from "@/server/auth/session";
import { transitionTimesheet } from "@/server/services/timesheet-service";

const actions: Record<string, TimesheetStatus> = {
  submit: "submitted",
  approve: "approved",
  reject: "rejected",
  reopen: "reopened",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await context.params;
  const target = actions[action];
  if (!target)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const actor = await verifySession();
    if (!actor)
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    const body = (await request.json().catch(() => ({}))) as {
      reason?: unknown;
    };
    const reason = typeof body.reason === "string" ? body.reason : null;
    const result = await transitionTimesheet(actor, id, target, reason);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Timesheet transition failed", error);
    const code = error instanceof Error ? error.message : "INTERNAL";
    const status =
      code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(
      {
        error:
          code === "ALREADY_REPORTED"
            ? "You already reported this week. Delete the existing draft if you want to report again, or edit that draft."
            : status === 409
              ? "The operation could not be completed"
              : code,
      },
      { status },
    );
  }
}
