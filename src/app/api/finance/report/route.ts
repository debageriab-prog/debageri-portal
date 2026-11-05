import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { getServerLocale, getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  downloadResponse,
  monthNames,
  parseExportQuery,
} from "@/server/export/download";
import {
  exportFinanceReport,
  FinanceReportExportError,
} from "@/server/services/finance-report-export-service";

export async function GET(request: Request) {
  const actor = await verifySession();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = parseExportQuery(request);
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { userId, year, month, format } = parsed.data;
  const [t, locale] = await Promise.all([getTranslator(), getServerLocale()]);
  try {
    const { fileName, contentType, data } = await exportFinanceReport(
      getAdminServices().db,
      actor,
      userId,
      { year, month },
      {
        title: t("financeReport"),
        total: t("total"),
        monthNames: monthNames(locale),
        openingBalance: t("financeReportOpeningBalance"),
        workedHours: t("financeReportWorkedHours"),
        hourlyRate: t("financeReportHourlyRate"),
        invoiced: t("financeReportInvoiced"),
        paidInvoices: t("financeReportPaidInvoices"),
        share: t("financeReportConsultantShare"),
        ownShare: t("financeReportYourShare"),
        totalIncome: t("financeReportTotalIncome"),
        totalExpenses: t("financeReportTotalExpenses"),
        result: t("financeReportResult"),
        closingBalance: t("financeReportClosingBalance"),
        companyFunded: t("financeReportCompanyFunded"),
        companyFundedTotal: t("financeReportCompanyFundedTotal"),
      },
      locale,
      format,
    );
    return downloadResponse(fileName, contentType, data);
  } catch (error) {
    if (error instanceof FinanceReportExportError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Finance report export failed", { userId, error });
    return NextResponse.json(
      { error: "financeReportExportFailed" },
      { status: 500 },
    );
  }
}
