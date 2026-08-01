import { notFound } from "next/navigation";
import { CategoryForm } from "../../../FinanceForms";
import { financeFormContext } from "../../../form-data";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor, db } = await financeFormContext(true);
  const document = await db.collection("financeCategories").doc(id).get();
  const data = document.data();
  if (!document.exists || data?.organizationId !== actor.organizationId)
    notFound();
  return (
    <CategoryForm
      category={{
        id: document.id,
        code: String(data.code),
        name: data.name as { en: string; sv: string },
        direction: data.direction as "income" | "expense",
        active: data.active !== false,
      }}
    />
  );
}
