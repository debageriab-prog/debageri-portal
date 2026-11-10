import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import {
  notifyRequestSubmitted,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { verifySession } from "@/server/auth/session";
import { parseRequestForm } from "@/server/validators/requests";
import {
  canSubmitRequests,
  createRequest,
  RequestError,
} from "@/server/services/request-service";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canSubmitRequests(actor))
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
    const id = await createRequest(db, storage, actor, parsed.data, files);
    await notifyRequestSubmitted(id, portalUrlFrom(request));
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Request submission failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "requestSaveFailed" }, { status: 500 });
  }
}
