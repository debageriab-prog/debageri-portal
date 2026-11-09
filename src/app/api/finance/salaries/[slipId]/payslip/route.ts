import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { FinanceError } from "@/server/services/finance-service";
import { salarySlipPdfFile } from "@/server/services/salary-service";

/** A salary row's generated payslip PDF, for finance to check it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slipId: string }> },
) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { slipId } = await params;
  try {
    const { db, storage } = getAdminServices();
    const { contents, fileName } = await salarySlipPdfFile(
      db,
      storage,
      actor,
      slipId,
    );
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment";
    return new Response(new Uint8Array(contents), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
