import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { reachOf } from "@/server/auth/reach";
import { verifySession } from "@/server/auth/session";
import { receiptVisible } from "@/server/services/receipt-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const [receipt, reach] = await Promise.all([
    db.collection("receipts").doc(id).get(),
    reachOf(db, actor),
  ]);
  const data = receipt.data();
  if (!receipt.exists || !receiptVisible(actor, data!, reach))
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [contents] = await storage
    .bucket()
    .file(String(data!.storagePath))
    .download();
  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";
  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": String(data!.contentType),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(String(data!.fileName))}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
