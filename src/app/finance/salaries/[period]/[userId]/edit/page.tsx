import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { validSalaryPeriod } from "@/domain/salary/slip";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { loadTaxTable } from "@/server/services/tax-table-service";
import { loadSalaryRow, loadTimeSummary } from "../../../salary-data";
import { SalarySlipEditor } from "../../../SalarySlipEditor";

export default async function SalaryRowPage({
  params,
}: {
  params: Promise<{ period: string; userId: string }>;
}) {
  const actor = await verifySession();
  // The layout signs people out too, but pages render alongside it.
  if (!actor) redirect("/auth/login");
  const { period, userId } = await params;
  if (!validSalaryPeriod(period)) notFound();
  const t = await getTranslator();
  const { db } = getAdminServices();
  const row = await loadSalaryRow(
    db,
    actor.organizationId,
    period,
    decodeURIComponent(userId),
  );
  if (!row) notFound();
  const timeSummary = await loadTimeSummary(
    db,
    actor.organizationId,
    row.userId,
    row.eventFrom,
    row.eventTo,
  );
  const taxTable =
    row.tax.table === null
      ? null
      : await loadTaxTable(
          db,
          actor.organizationId,
          row.tax.year,
          row.tax.table,
        );
  return (
    <>
      <div className="topbar">
        <div>
          <Link
            className="text-link"
            href={`/finance/salaries?period=${period}`}
          >
            ← {t("backToSalaries")}
          </Link>
          <h1>
            {row.name} · {period}
          </h1>
          <p className="muted page-description">
            {t("salaryRowDescription")
              .replace("{paymentDate}", row.paymentDate)
              .replace("{eventFrom}", row.eventFrom)
              .replace("{eventTo}", row.eventTo)}
          </p>
        </div>
      </div>
      <SalarySlipEditor
        key={row.version}
        row={row}
        taxRows={taxTable?.rows ?? null}
        timeSummary={timeSummary}
        canEdit={can(actor, "finance.salary.edit")}
        canBook={can(actor, "finance.salary.book")}
      />
    </>
  );
}
