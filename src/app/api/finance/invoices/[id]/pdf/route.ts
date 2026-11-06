import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { downloadResponse } from "@/server/export/download";
import { PDF_CONTENT_TYPE } from "@/server/export/invoice-pdf";
import { FinanceError } from "@/server/services/finance-service";
import { invoicePdfFile } from "@/server/services/invoice-document-service";

/** Downloads the invoice PDF, generating it first when there is none. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const { db, storage } = getAdminServices();
  try {
    const { pdf, fileName } = await invoicePdfFile(db, storage, actor, id);
    return downloadResponse(fileName, PDF_CONTENT_TYPE, pdf);
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Invoice PDF download failed", {
      invoiceId: id,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "financeOperationFailed" },
      { status: 500 },
    );
  }
}
