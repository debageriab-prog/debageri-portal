import { notFound } from "next/navigation";
import { financeFormContext } from "../../../form-data";
import { InvoiceAttachmentForm } from "./InvoiceAttachmentForm";

export default async function InvoiceAttachmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uploadFailed?: string }>;
}) {
  const { actor, db } = await financeFormContext();
  const { id } = await params;
  const invoice = await db.collection("invoices").doc(id).get();
  if (
    !invoice.exists ||
    invoice.data()?.organizationId !== actor.organizationId
  )
    notFound();
  return (
    <InvoiceAttachmentForm
      invoiceId={id}
      invoiceNumber={String(invoice.data()?.invoiceNumber)}
      uploadFailed={(await searchParams).uploadFailed === "1"}
    />
  );
}
