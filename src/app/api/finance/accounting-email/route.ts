import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { sendAccountingEmailSchema } from "@/server/validators/accounting-email";
import {
  AccountingEmailError,
  sendAccountingEmail,
} from "@/server/services/accounting-email-service";

/** Emails a saved finance record and its files to the accounting contacts. */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!["admin", "accountant"].includes(actor.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = sendAccountingEmailSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db, storage } = getAdminServices();
  try {
    return NextResponse.json(
      await sendAccountingEmail(
        db,
        storage,
        actor,
        parsed.data.entityType,
        parsed.data.entityId,
      ),
    );
  } catch (error) {
    if (error instanceof AccountingEmailError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
