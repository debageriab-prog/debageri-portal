import { notFound } from "next/navigation";
import { reachesRecord } from "@/domain/access/groups";
import { accountingRecipientsFor } from "@/server/services/accounting-email-service";
import { financeFormContext } from "../../../form-data";
import { InvoiceAttachmentForm } from "./InvoiceAttachmentForm";

export default async function InvoiceAttachmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uploadFailed?: string }>;
}) {
  const { actor, db, reach } = await financeFormContext(
    "finance.invoices.edit",
  );
  const { id } = await params;
  const invoice = await db.collection("invoices").doc(id).get();
  if (
    !invoice.exists ||
    invoice.data()?.organizationId !== actor.organizationId ||
    !reachesRecord(reach, invoice.data()?.consultantId)
  )
    notFound();
  return (
    <InvoiceAttachmentForm
      invoiceId={id}
      invoiceNumber={String(invoice.data()?.invoiceNumber)}
      uploadFailed={(await searchParams).uploadFailed === "1"}
      accountingRecipients={await accountingRecipientsFor(
        actor,
        db,
        "invoices",
      )}
    />
  );
}
