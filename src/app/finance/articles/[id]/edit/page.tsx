import { notFound } from "next/navigation";
import { articleScopeEditableBy } from "@/domain/finance/reach";
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
  const { actor, db, reach, reachesCompany } = await financeFormContext(
    "finance.articles.edit",
  );
  const { id } = await params;
  const document = await db.collection("invoiceArticles").doc(id).get();
  const data = document.data();
  if (
    !document.exists ||
    data?.organizationId !== actor.organizationId ||
    !articleScopeEditableBy(reach, String(data.consultantScope ?? "all"))
  )
    notFound();
  return (
    <ArticleForm
      article={invoiceArticleFrom(document.id, data)}
      users={await financeUsers()}
      reachesCompany={reachesCompany}
    />
  );
}
