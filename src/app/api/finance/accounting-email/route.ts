import { NextResponse } from "next/server";
import { can, FINANCE_ENTITY_PERMISSIONS } from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeIsEnabled } from "@/server/services/finance-service";
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
  if (!can(actor, "finance.accountingEmail"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = sendAccountingEmailSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  if (!can(actor, FINANCE_ENTITY_PERMISSIONS[parsed.data.entityType].view))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { db, storage } = getAdminServices();
  if (!(await financeIsEnabled(db, actor.organizationId)))
    return NextResponse.json({ error: "financeDisabled" }, { status: 409 });
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
