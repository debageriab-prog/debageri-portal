import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { parseReceiptForm } from "@/server/validators/receipts";
import {
  canSubmitReceipts,
  createReceipt,
  ReceiptError,
} from "@/server/services/receipt-service";

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || !canSubmitReceipts(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await request.formData();
  const parsed = parseReceiptForm(form);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "receiptFileRequired" }, { status: 400 });
  const { db, storage } = getAdminServices();
  try {
    const id = await createReceipt(db, storage, actor, parsed.data, file);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof ReceiptError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Receipt upload failed", { actorId: actor.id, error });
    return NextResponse.json({ error: "receiptSaveFailed" }, { status: 500 });
  }
}
