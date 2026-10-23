import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { parsePayslipForm } from "@/server/validators/payslips";
import {
  canManagePayslips,
  PayslipError,
  uploadPayslip,
} from "@/server/services/payslip-service";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canManagePayslips(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parsePayslipForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "payslipFileRequired" }, { status: 400 });
  const { db, storage } = getAdminServices();
  try {
    const id = await uploadPayslip(db, storage, actor, parsed.data, file);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof PayslipError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Payslip upload failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "payslipSaveFailed" }, { status: 500 });
  }
}
