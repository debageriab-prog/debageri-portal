import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  addTimesheetAttachment,
  listTimesheetAttachments,
} from "@/server/services/timesheet-attachment-service";
import { attachmentErrorResponse } from "./respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const { db } = getAdminServices();
    return NextResponse.json(await listTimesheetAttachments(db, actor, id));
  } catch (error) {
    return attachmentErrorResponse(error, "attachmentLoadFailed");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "attachmentRequired" }, { status: 400 });
  try {
    const { db, storage } = getAdminServices();
    await addTimesheetAttachment(db, storage, actor, id, file);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return attachmentErrorResponse(error, "attachmentUploadFailed");
  }
}
