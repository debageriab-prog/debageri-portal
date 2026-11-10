import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import {
  notifyRequestStatusChanged,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { verifySession } from "@/server/auth/session";
import {
  parseRequestForm,
  requestStatusSchema,
} from "@/server/validators/requests";
import {
  canUseRequests,
  canViewOwnRequests,
  changeRequestStatus,
  RequestError,
  updateRequest,
} from "@/server/services/request-service";

type Context = { params: Promise<{ id: string }> };

/** The requester edits their own request while it is still requested. */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canViewOwnRequests(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parseRequestForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);
  const { db, storage } = getAdminServices();
  try {
    await updateRequest(db, storage, actor, id, parsed.data, files);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof RequestError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Request update failed", { requestId: id, error });
    return NextResponse.json({ error: "requestSaveFailed" }, { status: 500 });
  }
}

/** Reviewers change the status; the requester can withdraw. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canUseRequests(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = requestStatusSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  try {
    await changeRequestStatus(db, actor, id, parsed.data);
    if (parsed.data.status !== "withdrawn")
      await notifyRequestStatusChanged(
        id,
        portalUrlFrom(request),
        parsed.data.note,
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Request status change failed", { requestId: id, error });
    return NextResponse.json({ error: "requestStatusFailed" }, { status: 500 });
  }
}
