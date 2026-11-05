import type { Firestore } from "firebase-admin/firestore";
import {
  can,
  canViewOwnHistory,
  type PermissionKey,
} from "@/domain/access/permissions";
import {
  buildExportSheets,
  exportFileName,
  exportPeriodBounds,
  reportVisibleTo,
  type ExportEntry,
  type ExportFormat,
  type ExportPeriod,
} from "@/domain/reports/time-report-export";
import {
  PDF_CONTENT_TYPE,
  timeReportPdf,
} from "@/server/export/time-report-pdf";
import {
  timeReportWorkbook,
  XLSX_CONTENT_TYPE,
  type WorkbookLabels,
} from "@/server/export/time-report-workbook";

export class TimeReportExportError extends Error {
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
  role: string;
  reportsTime: boolean;
  permissions: readonly PermissionKey[];
};

export const canExportOwnTimeReport = (actor: Actor) =>
  canViewOwnHistory(actor) && can(actor, "my.time.export");

export const canExportTimeReports = (actor: Actor) =>
  can(actor, "time.reports.export");

/**
 * Builds the Excel or PDF report for one person and period. People export their own
 * time with `my.time.export`; staff export someone they can open on the time
 * reports page with `time.reports.export`.
 */
export async function exportTimeReport(
  db: Firestore,
  actor: Actor,
  userId: string,
  period: ExportPeriod,
  labels: WorkbookLabels & { emptySheet: string },
  format: ExportFormat = "xlsx",
) {
  const own = userId === actor.id && canExportOwnTimeReport(actor);
  if (!own && !canExportTimeReports(actor))
    throw new TimeReportExportError("forbidden", 403);
  const userSnapshot = await db.collection("users").doc(userId).get();
  const user = userSnapshot.data();
  if (
    !user ||
    user.organizationId !== actor.organizationId ||
    (!own &&
      !reportVisibleTo(actor.role, {
        role: user.role,
        reportsTime: user.reportsTime,
      }))
  )
    throw new TimeReportExportError("notFound", 404);

  const [start, end] = exportPeriodBounds(period);
  const [entrySnapshot, holidaySnapshot] = await Promise.all([
    db.collection("timeEntries").where("userId", "==", userId).get(),
    db
      .collection("holidays")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const entries: ExportEntry[] = entrySnapshot.docs
    .map((doc) => doc.data())
    .filter(
      (data) =>
        data.organizationId === actor.organizationId &&
        String(data.date) >= start &&
        String(data.date) <= end,
    )
    .map((data) => ({
      date: String(data.date),
      minutes: Number(data.minutes ?? 0),
      timeCodeId: String(data.timeCodeId ?? data.timeCodeSnapshot?.code),
      name: String(
        data.timeCodeSnapshot?.name ??
          data.timeCodeSnapshot?.code ??
          data.timeCodeId,
      ),
      countsAsWorkedTime: Boolean(data.timeCodeSnapshot?.countsAsWorkedTime),
    }));
  const sheets = buildExportSheets(
    entries,
    period,
    holidaySnapshot.docs.map((doc) => String(doc.data().date)),
    labels.emptySheet,
  );
  const displayName = String(user.displayName ?? user.email ?? "");
  const fileName = exportFileName(displayName, period, format);
  if (format === "xlsx")
    return {
      fileName,
      contentType: XLSX_CONTENT_TYPE,
      data: timeReportWorkbook(sheets, labels),
    };
  const periodLabel = period.month
    ? `${labels.monthNames[period.month - 1]} ${period.year}`
    : String(period.year);
  return {
    fileName,
    contentType: PDF_CONTENT_TYPE,
    data: timeReportPdf(sheets, labels, `${displayName} · ${periodLabel}`),
  };
}
