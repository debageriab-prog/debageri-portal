import type { Firestore } from "firebase-admin/firestore";
import { can, type PermissionKey } from "@/domain/access/permissions";
import { canViewMyFinance } from "@/domain/finance/calculations";
import {
  buildFinanceReport,
  financeReportFileName,
  type FinanceReportLabels,
} from "@/domain/finance/report-export";
import {
  exportPeriodBounds,
  sheetNames,
  type ExportFormat,
  type ExportPeriod,
} from "@/domain/reports/time-report-export";
import type { CompensationModel } from "@/domain/types";
import { financeReportPdf } from "@/server/export/finance-report-pdf";
import { financeReportWorkbook } from "@/server/export/finance-report-workbook";
import { PDF_CONTENT_TYPE } from "@/server/export/pdf-document";
import { XLSX_CONTENT_TYPE } from "@/server/export/xlsx-package";

export class FinanceReportExportError extends Error {
  constructor(
    readonly code: "forbidden" | "notFound",
    readonly status: number,
  ) {
    super(code);
  }
}

type Actor = {
  id: string;
  organizationId: string;
  compensationModel?: CompensationModel | null;
  permissions: PermissionKey[];
};

export const canExportOwnFinanceReport = (actor: Actor) =>
  canViewMyFinance(actor) && can(actor, "my.finance.export");

export const canExportFinanceReports = (actor: Actor) =>
  can(actor, "finance.overview.export");

export type FinanceReportText = FinanceReportLabels & {
  ownShare: string;
  title: string;
  total: string;
  monthNames: readonly string[];
};

/**
 * Builds the finance report for one consultant and period. Consultants export
 * their own with `my.finance.export`; finance staff export any consultant in
 * the organization with `finance.overview.export`.
 */
export async function exportFinanceReport(
  db: Firestore,
  actor: Actor,
  userId: string,
  period: ExportPeriod,
  text: FinanceReportText,
  locale: "sv-SE" | "en-SE",
  format: ExportFormat,
) {
  const own = userId === actor.id && canExportOwnFinanceReport(actor);
  if (!own && !canExportFinanceReports(actor))
    throw new FinanceReportExportError("forbidden", 403);
  const user = (await db.collection("users").doc(userId).get()).data();
  if (
    !user ||
    user.organizationId !== actor.organizationId ||
    !["consultant", "employee"].includes(String(user.role))
  )
    throw new FinanceReportExportError("notFound", 404);

  const organizationId = actor.organizationId;
  const [, end] = exportPeriodBounds(period);
  const [
    categorySnapshot,
    transactionSnapshot,
    invoiceSnapshot,
    entrySnapshot,
    timeCodeSnapshot,
  ] = await Promise.all([
    db
      .collection("financeCategories")
      .where("organizationId", "==", organizationId)
      .get(),
    db
      .collection("financialTransactions")
      .where("consultantId", "==", userId)
      .get(),
    db.collection("invoices").where("consultantId", "==", userId).get(),
    db.collection("timeEntries").where("userId", "==", userId).get(),
    db
      .collection("timeCodes")
      .where("organizationId", "==", organizationId)
      .get(),
  ]);
  const ours = (data: FirebaseFirestore.DocumentData) =>
    data.organizationId === organizationId;
  const workedCodes = timeCodeSnapshot.docs
    .map((doc) => doc.data())
    .filter((code) => code.countsAsWorkedTime === true);
  const fallbackRate = Number(
    workedCodes.find((code) => code.assignedUserId === userId)?.hourlyRate ??
      workedCodes.find((code) => !code.assignedUserId)?.hourlyRate ??
      0,
  );

  const report = buildFinanceReport({
    period,
    language: locale === "sv-SE" ? "sv" : "en",
    labels: { ...text, share: own ? text.ownShare : text.share },
    categories: categorySnapshot.docs.map((doc) => ({
      id: doc.id,
      code: String(doc.data().code ?? ""),
      name: {
        en: String(doc.data().name?.en ?? ""),
        sv: String(doc.data().name?.sv ?? ""),
      },
    })),
    // Only movements up to the end of the period matter, including the
    // earlier ones that make up the opening balance.
    transactions: transactionSnapshot.docs
      .map((doc) => doc.data())
      .filter((data) => ours(data) && String(data.date) <= end)
      .map((data) => ({
        direction: data.direction === "income" ? "income" : "expense",
        categoryId: String(data.categoryId),
        invoiceId: data.invoiceId ?? null,
        date: String(data.date),
        consultantBalanceDeltaMinor: Number(
          data.consultantBalanceDeltaMinor ?? 0,
        ),
      })),
    invoices: invoiceSnapshot.docs
      .map((doc) => doc.data())
      .filter(ours)
      .map((data) => ({
        status: data.status,
        issueDate: String(data.issueDate),
        periodFrom: data.periodFrom ?? null,
        paidDate: data.paidDate ?? null,
        netMinor: Number(data.netMinor ?? 0),
        shareBps: Number(data.shareBps ?? 0),
      })),
    workedEntries: entrySnapshot.docs
      .map((doc) => doc.data())
      .filter((data) => ours(data) && data.timeCodeSnapshot?.countsAsWorkedTime)
      .map((data) => ({
        date: String(data.date),
        minutes: Number(data.minutes ?? 0),
        hourlyRate: Number(data.timeCodeSnapshot?.hourlyRate ?? fallbackRate),
      })),
  });

  const displayName = String(user.displayName ?? user.email ?? "");
  const periodLabel = period.month
    ? `${text.monthNames[period.month - 1]} ${period.year}`
    : String(period.year);
  const fileName = financeReportFileName(displayName, period, format);
  const header = {
    title: `${displayName} · ${periodLabel}`,
    total: text.total,
    sheetName: sheetNames([text.title])[0]!,
    monthNames: text.monthNames,
  };
  return format === "xlsx"
    ? {
        fileName,
        contentType: XLSX_CONTENT_TYPE,
        data: financeReportWorkbook(report, header),
      }
    : {
        fileName,
        contentType: PDF_CONTENT_TYPE,
        data: financeReportPdf(
          report,
          {
            ...header,
            title: displayName,
            subtitle: `${text.title} · ${periodLabel}`,
          },
          locale,
        ),
      };
}
