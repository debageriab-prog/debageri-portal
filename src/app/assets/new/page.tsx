import { redirect } from "next/navigation";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  assetSourceTransaction,
  canManageAssets,
  handoverRecipients,
} from "@/server/services/asset-service";
import { AssetForm, type AssetSource } from "../AssetForm";
import { FormHeader } from "../FormHeader";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ transactionId?: string }>;
}) {
  const actor = (await verifySession())!;
  if (!canManageAssets(actor)) redirect("/unauthorized");
  const { transactionId } = await searchParams;
  const { db } = getAdminServices();
  const [t, people, transaction] = await Promise.all([
    getTranslator(),
    handoverRecipients(db, actor.organizationId),
    transactionId
      ? assetSourceTransaction(db, actor, transactionId).catch(() => null)
      : null,
  ]);
  const source: AssetSource | undefined = transaction
    ? {
        id: transaction.id,
        date: transaction.date,
        grossMinor: transaction.grossMinor,
        vatRateBps: transaction.vatRateBps,
        description: transaction.description,
        fileNames: transaction.files.map((file) => file.name),
      }
    : undefined;
  return (
    <>
      <FormHeader
        backHref="/assets"
        backLabel={t("assetBackToRegister")}
        title={t("assetNew")}
        description={t("assetNewDescription")}
      />
      {source && (
        <p className="notice notice-success" role="status">
          {t("assetFromExpense")}
        </p>
      )}
      {transactionId && !source && (
        <p className="notice notice-warning" role="status">
          {t("assetFromExpenseUnavailable")}
        </p>
      )}
      <AssetForm people={people} source={source} />
    </>
  );
}
