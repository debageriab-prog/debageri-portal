import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { financeIsEnabled } from "@/server/services/finance-service";
import {
  incomingEmailAvailability,
  listIncomingEmails,
  readIncomingEmailSettings,
} from "@/server/services/incoming-email-service";
import { IncomingEmails } from "./IncomingEmails";

export default async function IncomingEmailsPage() {
  const actor = (await verifySession())!;
  if (!can(actor, "finance.incomingEmails.view")) redirect("/unauthorized");
  const t = await getTranslator();
  const { db } = getAdminServices();
  const [financeOn, availability, settings] = await Promise.all([
    financeIsEnabled(db, actor.organizationId),
    incomingEmailAvailability(db, actor.organizationId),
    readIncomingEmailSettings(db, actor.organizationId),
  ]);
  const active = financeOn && availability.mailbox && availability.ai;
  const [emails, categories, users, customers] = active
    ? await Promise.all([
        listIncomingEmails(db, actor.organizationId, ["ready"]),
        db
          .collection("financeCategories")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("users")
          .where("organizationId", "==", actor.organizationId)
          .get(),
        db
          .collection("financeCustomers")
          .where("organizationId", "==", actor.organizationId)
          .get(),
      ])
    : [[], null, null, null];
  const names = {
    categories: Object.fromEntries(
      (categories?.docs ?? []).map((document) => {
        const name = document.data().name as { en?: string; sv?: string };
        return [
          document.id,
          String((actor.locale === "sv-SE" ? name?.sv : name?.en) ?? ""),
        ];
      }),
    ),
    consultants: Object.fromEntries(
      (users?.docs ?? []).map((document) => [
        document.id,
        String(document.data().displayName ?? ""),
      ]),
    ),
    customers: Object.fromEntries(
      (customers?.docs ?? []).map((document) => [
        document.id,
        String(document.data().name ?? ""),
      ]),
    ),
  };
  const isAdmin = actor.role === "admin";
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{t("incomingFinancialEmails")}</h1>
          <p className="muted page-description">
            {t("incomingFinancialEmailsDescription")}
          </p>
        </div>
      </div>
      {!active ? (
        <section className="card">
          <p className="notice notice-warning">
            {!financeOn
              ? t("financeDisabledDescription")
              : !availability.mailbox
                ? t("incomingEmailMailboxOff")
                : t("incomingEmailAiOff")}{" "}
            {isAdmin && financeOn && (
              <Link
                href={
                  availability.mailbox
                    ? "/admin/ai-integration"
                    : "/admin/email-settings?tab=incoming"
                }
              >
                {availability.mailbox
                  ? t("aiIntegration")
                  : t("emailSettingsTab_incoming")}
              </Link>
            )}
          </p>
        </section>
      ) : (
        <IncomingEmails
          initialEmails={emails}
          names={names}
          lastRunAt={settings.lastRunAt}
          canProcess={can(actor, "finance.incomingEmails.process")}
          canAddTransaction={can(actor, "finance.ledger.add")}
          canAddInvoice={can(actor, "finance.invoices.add")}
        />
      )}
    </>
  );
}
