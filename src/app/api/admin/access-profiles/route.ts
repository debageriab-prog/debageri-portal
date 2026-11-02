import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AccessProfileError,
  createAccessProfile,
} from "@/server/services/access-profile-service";
import { accessProfileSchema } from "@/server/validators/access-profile";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = accessProfileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const id = await createAccessProfile(
      getAdminServices().db,
      actor,
      parsed.data,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessProfileError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Access profile creation failed", { error });
    return NextResponse.json({ error: "saveFailed" }, { status: 500 });
  }
}
