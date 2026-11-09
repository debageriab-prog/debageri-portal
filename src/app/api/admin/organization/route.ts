import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { invoiceSettingsSchema } from "@/server/validators/organization";
import {
  formatBankgiro,
  formatPlusgiro,
  formatOrgNumber,
} from "@/domain/finance/swedish-identifiers";

/** Saves the company details and number counters used on invoices. */
export async function PUT(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = invoiceSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "invalidInput",
        fields: parsed.error.issues.map((issue) => ({
          field: String(issue.path[0] ?? ""),
          code: issue.message,
        })),
      },
      { status: 400 },
    );
  const settings = {
    ...parsed.data,
    orgNumber: formatOrgNumber(parsed.data.orgNumber),
    vatNumber: parsed.data.vatNumber.replace(/\s/g, "").toUpperCase(),
    bankgiro: formatBankgiro(parsed.data.bankgiro),
    plusgiro: formatPlusgiro(parsed.data.plusgiro),
    iban: parsed.data.iban.replace(/\s/g, "").toUpperCase(),
    bic: parsed.data.bic.toUpperCase(),
  };
  const { db } = getAdminServices();
  const reference = db.collection("organizations").doc(actor.organizationId);
  const batch = db.batch();
  batch.set(
    reference,
    {
      invoicing: settings,
      invoicingUpdatedAt: FieldValue.serverTimestamp(),
      invoicingUpdatedBy: actor.id,
    },
    { merge: true },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "organization.invoiceSettingsUpdated",
    entityType: "organization",
    entityId: actor.organizationId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: {
      nextInvoiceNumber: settings.nextInvoiceNumber,
      nextCustomerNumber: settings.nextCustomerNumber,
    },
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
