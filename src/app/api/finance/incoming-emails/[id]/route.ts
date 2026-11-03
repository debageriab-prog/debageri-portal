import { NextResponse } from "next/server";
import { updateIncomingEmail } from "@/server/services/incoming-email-service";
import { incomingEmailActionSchema } from "@/server/validators/incoming-email";
import { incomingEmailContext, incomingEmailFailure } from "../context";

/** Dismisses, restores or reads an email again with AI. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const value = await incomingEmailContext("finance.incomingEmails.process");
  if ("error" in value) return value.error;
  const parsed = incomingEmailActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const email = await updateIncomingEmail(
      value.db,
      value.storage,
      value.actor,
      (await params).id,
      parsed.data.action,
    );
    return NextResponse.json({ email });
  } catch (error) {
    return incomingEmailFailure(error);
  }
}
