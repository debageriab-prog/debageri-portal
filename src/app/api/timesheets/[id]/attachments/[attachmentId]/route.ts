import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  readTimesheetAttachment,
  removeTimesheetAttachment,
} from "@/server/services/timesheet-attachment-service";
import { timesheetAttachmentRemovalSchema } from "@/server/validators/timesheet-attachments";
import { attachmentErrorResponse } from "../respond";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id, attachmentId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const { db, storage } = getAdminServices();
    const file = await readTimesheetAttachment(
      db,
      storage,
      actor,
      id,
      attachmentId,
    );
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment";
    return new Response(new Uint8Array(file.contents), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return attachmentErrorResponse(error, "attachmentLoadFailed");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id, attachmentId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = timesheetAttachmentRemovalSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "confirmationRequired" },
      { status: 400 },
    );
  try {
    const { db, storage } = getAdminServices();
    await removeTimesheetAttachment(db, storage, actor, id, attachmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return attachmentErrorResponse(error, "attachmentRemoveFailed");
  }
}
