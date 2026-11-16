import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  createUserGroup,
  UserGroupError,
} from "@/server/services/user-group-service";
import { userGroupSchema } from "@/server/validators/user-group";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = userGroupSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const id = await createUserGroup(getAdminServices().db, actor, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof UserGroupError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("User group creation failed", { error });
    return NextResponse.json({ error: "saveFailed" }, { status: 500 });
  }
}
