import { notFound } from "next/navigation";
import { ArticleForm } from "../../../FinanceForms";
import {
  financeFormContext,
  financeUsers,
  invoiceArticleFrom,
} from "../../../form-data";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor, db } = await financeFormContext("finance.articles.edit");
  const { id } = await params;
  const document = await db.collection("invoiceArticles").doc(id).get();
  const data = document.data();
  if (!document.exists || data?.organizationId !== actor.organizationId)
    notFound();
  return (
    <ArticleForm
      article={invoiceArticleFrom(document.id, data)}
      users={await financeUsers()}
    />
  );
}
