import { notFound } from "next/navigation";
import { CustomerForm } from "../../../FinanceForms";
import { editableCustomer, financeFormContext } from "../../../form-data";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor, db } = await financeFormContext("finance.customers.edit");
  const document = await db.collection("financeCustomers").doc(id).get();
  const data = document.data();
  if (!document.exists || data?.organizationId !== actor.organizationId)
    notFound();
  return <CustomerForm customer={editableCustomer(document.id, data)} />;
}
