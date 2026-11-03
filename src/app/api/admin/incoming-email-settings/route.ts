import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  IncomingEmailError,
  saveIncomingEmailSettings,
  testIncomingEmailConnection,
} from "@/server/services/incoming-email-service";
import {
  incomingEmailConnectionSchema,
  incomingEmailSettingsSchema,
} from "@/server/validators/incoming-email";

function failure(error: unknown) {
  if (error instanceof IncomingEmailError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  throw error;
}

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = incomingEmailSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    await saveIncomingEmailSettings(getAdminServices().db, actor, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

/** Tries to open the mailbox folder with the settings as typed. */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = incomingEmailConnectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    await testIncomingEmailConnection(
      getAdminServices().db,
      actor,
      parsed.data,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
