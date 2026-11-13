import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/access/permissions";
import { verifySession } from "@/server/auth/session";
import { downloadResponse } from "@/server/export/download";
import { PDF_CONTENT_TYPE } from "@/server/export/pdf-document";
import { transactionListPdf } from "@/server/export/transaction-list-pdf";

/**
 * Lays out the Income and expenses view the browser has already filtered
 * (period, consultant and search) as a PDF. The rows are the ones the
 * exporter sees on screen, so nothing new is read here.
 */
const text = (max: number) => z.string().max(max);

const requestSchema = z.object({
  fileName: z
    .string()
    .regex(/^[\w.-]{1,120}\.pdf$/)
    .default("income-expenses.pdf"),
  title: text(200),
  details: z.array(text(300)).max(10),
  totals: z.array(z.object({ label: text(120), value: text(120) })).max(24),
  columns: z
    .array(
      z.object({
        label: text(80),
        align: z.enum(["left", "right"]),
        width: z.number().min(0.5).max(10),
      }),
    )
    .min(1)
    .max(16),
  rows: z.array(z.array(text(500)).max(16)).max(10_000),
  pageLabel: text(80),
  emptyLabel: text(200),
});

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session || !can(session, "finance.ledger.export"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { fileName, ...document } = parsed.data;
  return downloadResponse(
    fileName,
    PDF_CONTENT_TYPE,
    transactionListPdf(document),
  );
}
