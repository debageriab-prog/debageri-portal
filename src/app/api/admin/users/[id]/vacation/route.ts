import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { verifySession } from "@/server/auth/session";
import {
  adjustVacationBalance,
  getVacationSummary,
  VacationError,
} from "@/server/services/vacation-service";
import { vacationActionSchema } from "@/server/validators/vacation";

function failure(error: unknown) {
  if (error instanceof VacationError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  return NextResponse.json({ error: "serverError" }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const { db } = getAdminServices();
    return NextResponse.json(
      await getVacationSummary(
        db,
        actor.organizationId,
        id,
        stockholmDateTime().date,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin" || actor.impersonatedBy)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = vacationActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { id } = await context.params;
  try {
    const { db } = getAdminServices();
    await adjustVacationBalance(
      db,
      actor,
      id,
      {
        normal: parsed.data.normalMinutes,
        saved: parsed.data.savedMinutes,
        advance: parsed.data.advanceMinutes,
      },
      parsed.data.note,
      stockholmDateTime().date,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
