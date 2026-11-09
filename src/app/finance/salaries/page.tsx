import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { defaultPaymentDate, validSalaryPeriod } from "@/domain/salary/slip";
import { monthBounds, previousMonth } from "@/domain/time/working-days";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { salaryCandidates } from "@/server/services/salary-service";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import { loadSalaryRun } from "./salary-data";
import { SalaryRun } from "./SalaryRun";

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await verifySession();
  // The layout signs people out too, but pages render alongside it.
  if (!actor) redirect("/auth/login");
  const t = await getTranslator();
  const { period: requested } = await searchParams;
  const period =
    requested && validSalaryPeriod(requested)
      ? requested
      : stockholmDateTime().date.slice(0, 7);
  const { db } = getAdminServices();
  const [{ run, rows }, candidates, organization] = await Promise.all([
    loadSalaryRun(db, actor.organizationId, period),
    salaryCandidates(db, actor.organizationId, period),
    db.collection("organizations").doc(actor.organizationId).get(),
  ]);
  const company = invoiceSettingsFrom(
    organization.data()?.invoicing,
    String(organization.data()?.name ?? ""),
  );
  const events = monthBounds(previousMonth(period));
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{t("salaries")}</h1>
          <p className="muted page-description">{t("salariesDescription")}</p>
        </div>
        {actor.role === "admin" && (
          <Link
            className="button secondary"
            href="/finance/salaries/tax-tables"
          >
            {t("taxTablesTitle")}
          </Link>
        )}
      </div>
      <SalaryRun
        period={period}
        run={run}
        rows={rows}
        candidates={candidates}
        defaults={{
          paymentDate: defaultPaymentDate(period),
          eventFrom: events.from,
          eventTo: events.to,
          excludedUserIds: [],
        }}
        canEdit={can(actor, "finance.salary.edit")}
        canBook={can(actor, "finance.salary.book")}
        agiContact={{
          name: actor.displayName,
          phone: company.phone,
          email: actor.email,
        }}
      />
    </>
  );
}
