import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { contractVisible } from "@/server/services/contract-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const [contract, file] = await Promise.all([
    db.collection("contracts").doc(id).get(),
    db.collection("contractFiles").doc(fileId).get(),
  ]);
  const contractData = contract.data();
  const fileData = file.data();
  if (
    !contract.exists ||
    !file.exists ||
    contractData?.organizationId !== actor.organizationId ||
    fileData?.organizationId !== actor.organizationId ||
    fileData?.contractId !== id ||
    !contractVisible(actor, contractData!)
  )
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [contents] = await storage
    .bucket()
    .file(String(fileData.storagePath))
    .download();
  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": String(fileData.contentType),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(fileData.name))}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
