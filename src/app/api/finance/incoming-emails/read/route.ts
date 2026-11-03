import { NextResponse } from "next/server";
import { readIncomingEmails } from "@/server/services/incoming-email-service";
import { incomingEmailContext, incomingEmailFailure } from "../context";

/** "Read now": reads the mailbox straight away instead of waiting an hour. */
export async function POST() {
  const value = await incomingEmailContext("finance.incomingEmails.process");
  if ("error" in value) return value.error;
  try {
    const summary = await readIncomingEmails(
      value.db,
      value.storage,
      value.actor.organizationId,
      "manual",
      value.actor.id,
    );
    return NextResponse.json({ summary });
  } catch (error) {
    return incomingEmailFailure(error);
  }
}
