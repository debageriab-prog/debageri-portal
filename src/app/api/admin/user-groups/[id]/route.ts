import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  updateUserGroup,
  UserGroupError,
} from "@/server/services/user-group-service";
import { userGroupSchema } from "@/server/validators/user-group";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = userGroupSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    await updateUserGroup(getAdminServices().db, actor, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UserGroupError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("User group change failed", { error });
    return NextResponse.json({ error: "saveFailed" }, { status: 500 });
  }
}
