import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { validSalaryPeriod } from "@/domain/salary/slip";
import { getAdminServices } from "@/lib/firebase/admin";
import { getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import { loadSalaryRow } from "../../../salary-data";
import { SalarySlipEditor } from "../../../SalarySlipEditor";

export default async function SalaryRowPage({
  params,
}: {
  params: Promise<{ period: string; userId: string }>;
}) {
  const actor = (await verifySession())!;
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
        row={row}
        canEdit={can(actor, "finance.salary.edit")}
        canBook={can(actor, "finance.salary.book")}
      />
    </>
  );
}
