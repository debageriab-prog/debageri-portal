import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import {
  notifyReceiptReviewed,
  portalUrlFrom,
} from "@/server/services/notification-service";
import { verifySession } from "@/server/auth/session";
import { receiptReviewSchema } from "@/server/validators/receipts";
import {
  canReviewReceipts,
  ReceiptError,
  reviewReceipt,
} from "@/server/services/receipt-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await verifySession();
  if (!actor || !canReviewReceipts(actor))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = receiptReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  try {
    await reviewReceipt(db, actor, id, parsed.data);
    await notifyReceiptReviewed(id, portalUrlFrom(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ReceiptError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Receipt review failed", { receiptId: id, error });
    return NextResponse.json({ error: "receiptReviewFailed" }, { status: 500 });
  }
}
