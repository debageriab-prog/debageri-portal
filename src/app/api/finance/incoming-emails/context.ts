import { NextResponse } from "next/server";
import { can, type PermissionKey } from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeIsEnabled } from "@/server/services/finance-service";
import {
  incomingEmailAvailability,
  IncomingEmailError,
} from "@/server/services/incoming-email-service";

/**
 * Signed in, allowed, finance on, and both the mailbox and the AI section
 * switched on; otherwise the response to send instead.
 */
export async function incomingEmailContext(key: PermissionKey) {
  const actor = await verifySession();
  if (!actor)
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  if (!can(actor, key))
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  const { db, storage } = getAdminServices();
  if (!(await financeIsEnabled(db, actor.organizationId)))
    return {
      error: NextResponse.json({ error: "financeDisabled" }, { status: 409 }),
    };
  const availability = await incomingEmailAvailability(
    db,
    actor.organizationId,
  );
  if (!availability.mailbox || !availability.ai)
    return {
      error: NextResponse.json(
        { error: "incomingEmailDisabled" },
        { status: 409 },
      ),
    };
  return { actor, db, storage };
}

export function incomingEmailFailure(error: unknown) {
  if (error instanceof IncomingEmailError)
    return NextResponse.json({ error: error.code }, { status: error.status });
  throw error;
}
