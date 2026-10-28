import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { aiSettingsSchema } from "@/server/validators/ai";
import { AiError, saveAiSettings } from "@/server/services/ai-service";

export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = aiSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    await saveAiSettings(getAdminServices().db, actor, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AiError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
