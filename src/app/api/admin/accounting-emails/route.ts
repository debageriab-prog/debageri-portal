import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { accountingContactsSchema } from "@/server/validators/accounting-email";
import { saveAccountingContacts } from "@/server/services/accounting-email-service";

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = accountingContactsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  await saveAccountingContacts(
    getAdminServices().db,
    actor,
    parsed.data.contacts,
  );
  return NextResponse.json({ ok: true });
}
