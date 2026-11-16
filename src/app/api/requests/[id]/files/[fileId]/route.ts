import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { reachOf } from "@/server/auth/reach";
import { verifySession } from "@/server/auth/session";
import {
  requestVisible,
  storedRequestFiles,
} from "@/server/services/request-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const [snapshot, reach] = await Promise.all([
    db.collection("requests").doc(id).get(),
    reachOf(db, actor),
  ]);
  const data = snapshot.data();
  if (!snapshot.exists || !data || !requestVisible(actor, data, reach))
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const file = storedRequestFiles(data.files).find(
    (item) => item.id === fileId,
  );
  if (!file) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [contents] = await storage.bucket().file(file.storagePath).download();
  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";
  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
