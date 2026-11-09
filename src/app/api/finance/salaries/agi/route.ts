import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { FinanceError } from "@/server/services/finance-service";
import { salaryAgiFile } from "@/server/services/salary-service";
import { salaryAgiFileSchema } from "@/server/validators/salary";

/** The month's AGI file (arbetsgivardeklaration) to upload to Skatteverket. */
export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = salaryAgiFileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  try {
    const { db } = getAdminServices();
    const { xml, fileName } = await salaryAgiFile(db, actor, parsed.data);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FinanceError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
