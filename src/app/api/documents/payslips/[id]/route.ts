import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManagePayslips,
  deletePayslip,
  PayslipError,
} from "@/server/services/payslip-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canManagePayslips(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (body?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: "confirmationRequired" },
      { status: 400 },
    );
  const { db, storage } = getAdminServices();
  try {
    await deletePayslip(db, storage, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PayslipError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Payslip deletion failed", { payslipId: id, error });
    return NextResponse.json({ error: "payslipDeleteFailed" }, { status: 500 });
  }
}
