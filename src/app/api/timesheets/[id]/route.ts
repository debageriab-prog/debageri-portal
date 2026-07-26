import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySession();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { id } = await context.params;
  const { db } = getAdminServices();
  const sheet = await db.collection("timesheets").doc(id).get();
  if (!sheet.exists || sheet.data()?.userId !== user.id)
    return NextResponse.json(
      { error: "Timesheet not found." },
      { status: 404 },
    );
  if (sheet.data()?.status !== "draft")
    return NextResponse.json(
      { error: "Only draft timesheets can be deleted." },
      { status: 409 },
    );
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (body?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: 'Type "I am sure" to confirm deletion.' },
      { status: 400 },
    );
  const entries = await db
    .collection("timeEntries")
    .where("timesheetId", "==", id)
    .get();
  const batch = db.batch();
  entries.docs.forEach((entry) => batch.delete(entry.ref));
  batch.delete(sheet.ref);
  await batch.commit();
  return NextResponse.json({ ok: true });
}
