import { notFound, redirect } from "next/navigation";
import type { InvoiceLine } from "@/domain/finance/invoice-lines";
import { InvoiceForm } from "../../../FinanceForms";
import {
  financeFormContext,
  financeUsers,
  invoiceCustomers,
  invoiceDefaults,
} from "../../../form-data";

/** Corrects an issued invoice that has not been sent to the customer. */
export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor, db } = await financeFormContext("finance.invoices.edit");
  const { id } = await params;
  const document = await db.collection("invoices").doc(id).get();
  const data = document.data();
  if (!document.exists || data?.organizationId !== actor.organizationId)
    notFound();
  // Sent, paid and void invoices are corrected by voiding them.
  if (data.status !== "issued" || data.sentAt)
    redirect(`/finance/invoices/${encodeURIComponent(id)}/attachments`);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return (
    <InvoiceForm
      users={await financeUsers()}
      customers={await invoiceCustomers(db, actor.organizationId)}
      defaults={await invoiceDefaults(db, actor.organizationId)}
      invoice={{
        id,
        invoiceNumber: text(data.invoiceNumber),
        customerId: text(data.customerId),
        consultantId: data.consultantId ? String(data.consultantId) : null,
        issueDate: text(data.issueDate),
        dueDate: text(data.dueDate),
        periodFrom: data.periodFrom ? String(data.periodFrom) : null,
        periodTo: data.periodTo ? String(data.periodTo) : null,
        netMinor: Number(data.netMinor ?? 0),
        vatRateBps: Number(data.vatRateBps ?? 0),
        roundingMinor: Number(data.roundingMinor ?? 0),
        shareBpsOverride:
          typeof data.shareBpsOverride === "number"
            ? data.shareBpsOverride
            : null,
        visibleDescription: text(data.visibleDescription),
        internalNote: text(data.internalNote),
        lines: Array.isArray(data.lines) ? (data.lines as InvoiceLine[]) : [],
        ourReference: text(data.ourReference),
        yourReference: text(data.yourReference),
        invoiceText: text(data.invoiceText),
      }}
    />
  );
}
