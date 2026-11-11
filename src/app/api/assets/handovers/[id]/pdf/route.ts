import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { getServerLocale } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  handoverPdf,
  handoverVisible,
  storedSignature,
} from "@/server/services/asset-service";
import { fileResponse } from "../../../file-response";

/**
 * The stored signed receipt once accepted, otherwise one made from the
 * receipt as it stands: a preview while it waits for the recipient.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db, storage } = getAdminServices();
  const snapshot = await db.collection("assetHandovers").doc(id).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || !handoverVisible(actor, data))
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  const file = {
    name: `equipment-receipt-${String(data.issuedOn ?? id)}.pdf`,
    contentType: "application/pdf",
  };
  try {
    if (data.pdfStoragePath) {
      const [contents] = await storage
        .bucket()
        .file(String(data.pdfStoragePath))
        .download();
      return fileResponse(request, file, contents);
    }
    const pdf = await handoverPdf(
      db,
      data,
      await getServerLocale(),
      await storedSignature(storage, data),
    );
    return fileResponse(request, file, pdf);
  } catch (error) {
    console.error("Equipment receipt PDF failed", { handoverId: id, error });
    return NextResponse.json({ error: "pdfFailed" }, { status: 500 });
  }
}
